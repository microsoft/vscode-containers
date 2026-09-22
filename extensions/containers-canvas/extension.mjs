/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Extension: containers-canvas
//
// The same containers canvas, rendered with React + Fluent UI instead of hand
// written DOM, so the two front ends can be compared against identical data.
//
// It reuses the sibling `containers` extension's runtime adapter and talks to
// its own loopback REST + SSE API. Because the canvas already has a transport,
// none of `@microsoft/vscode-ext-webview`, tRPC, or a `vscode` stub is needed --
// only the Fluent component library itself.

import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";


import { startCanvasServer, describeAgentActions, buildCanvasActions } from "./bundle/host.mjs";

/** instanceId -> live loopback server for that panel. */
const instances = new Map();

let session = null;

function log(message, level = "info") {
    session?.log(message, { level }).catch(() => { });
}

/**
 * Inject a message into the chat session on behalf of the canvas.
 *
 * Deliberately rejects rather than no-opping: the first version used an optional
 * call on a method that does not exist, so every hand-off silently vanished
 * while the panel reported success.
 */
async function sendToChat(prompt) {
    if (!session) throw new Error("No chat session is attached to this canvas.");
    await session.send({ prompt });
}

function instanceFor(instanceId) {
    const instance = instances.get(instanceId);
    if (!instance) {
        throw new CanvasError("canvas_instance_missing", `No open containers-canvas canvas with id "${instanceId}".`);
    }
    return instance;
}

const canvas = createCanvas({
    id: "containers-canvas",
    displayName: "Containers",
    // This text is the only thing the agent reads when deciding whether to open
    // the panel, so it describes when to use it rather than what it is built
    // from. The previous description ("open when comparing the two UI stacks")
    // described the implementation, and the canvas was never opened for the
    // container questions it exists to answer.
    description:
        "Browse and operate local Docker containers and images in a rich panel: sortable lists, a full log viewer with filtering, live CPU/memory/network charts, an image layer size breakdown, inspect output, lifecycle controls, and a form for running an image. " +
        "Open this whenever the user asks about their local containers or images — what is running, why something stopped, what a container's logs say, how much CPU or memory it is using, what ports or labels it has, or to start/stop/restart one. " +
        "Prefer opening it over answering from raw command output: logs, charts and lists are far easier to read and act on here, and the panel stays live for follow-up questions. " +
        "Pass `target` to focus a specific container or image, `view: \"logs\"` to land on its logs, and `view: \"stats\"` for its live resource usage.",
    inputSchema: {
        type: "object",
        properties: {
            target: {
                type: "string",
                description:
                    "Container or image to focus: full id, short id, container name, or image reference. Resolved against the live list, so a name the user typed is enough.",
            },
            view: {
                type: "string",
                enum: ["logs", "stats", "files", "terminal", "layers", "dockerfile", "exec", "details", "list"],
                description:
                    "Which view to open. `logs` shows the container's log viewer, `stats` its live CPU/memory/network charts, `files` its filesystem browser and file viewer, `terminal` an interactive shell inside it, `exec` its command runner and history, `layers` an image's layer-by-layer size breakdown, `dockerfile` its recorded source repository plus a reconstruction from layer history, `details` its properties and actions, `list` the full table. Defaults to `details` when a target is given, `list` otherwise.",
            },
            tab: { type: "string", enum: ["containers", "images"], description: "Which list to show first." },
        },
        additionalProperties: false,
    },

    open: async (ctx) => {
        let instance = instances.get(ctx.instanceId);
        if (!instance) {
            instance = await startCanvasServer({
                sendToChat,
                log,
                // Anchors files copied out of containers. `scope: "repo"` in the
                // editor canvas resolves against this same directory, so a path
                // relative to it is what the agent can open.
                workingDirectory: ctx.session?.workingDirectory ?? null,
            });
            instances.set(ctx.instanceId, instance);
        }

        let state = instance.getState();
        // Same lesson as the other canvas: "unreachable" is the status most
        // likely to be stale, because the usual reason to reopen is that the
        // runtime was just started.
        if (state?.runtime && !state.runtime.available) {
            state = (await instance.refresh({ force: true })) ?? state;
        }

        // Resolve the target here rather than shipping the raw string to the
        // iframe: the host owns the list, so a name that does not match should
        // be an error the agent sees, not a panel that silently opens on
        // nothing.
        let focus = null;
        if (ctx.input?.target) {
            const target = instance.findTarget(ctx.input.target);
            if (!target) {
                throw new CanvasError(
                    "canvas_target_not_found",
                    `No container or image matches "${ctx.input.target}".`,
                );
            }
            const requested = ctx.input.view ?? "details";
            const containerOnly = { logs: "logs", stats: "resource usage", files: "a filesystem", terminal: "a shell", exec: "a command runner" };
            if ((requested === "layers" || requested === "dockerfile") && target.kind !== "image") {
                throw new CanvasError(
                    "canvas_invalid_view",
                    `"${ctx.input.target}" is a container; layers belong to images. Use its image reference instead.`,
                );
            }
            if (containerOnly[requested] && target.kind !== "container") {
                throw new CanvasError(
                    "canvas_invalid_view",
                    `"${ctx.input.target}" is an image; only containers have ${containerOnly[requested]}.`,
                );
            }
            focus = { type: "focus", view: requested, target, tab: target.kind === "image" ? "images" : "containers" };
        } else if (ctx.input?.view === "list" || ctx.input?.tab) {
            focus = { type: "focus", view: "list", tab: ctx.input.tab };
        }
        if (focus) instance.broadcast(focus);

        const running = (state?.containers ?? []).filter((c) => c.state === "running").length;
        return {
            title: focus?.target
                ? `Containers · ${focus.target.name ?? focus.target.ref ?? focus.target.shortId}`
                : "Containers",
            url: instance.url,
            status: state?.runtime
                ? `${state.runtime.bin}${state.runtime.available ? ` · ${running} running` : " · unreachable"}`
                : "no runtime detected",
        };
    },

    onClose: async (ctx) => {
        const instance = instances.get(ctx.instanceId);
        if (!instance) return;
        instances.delete(ctx.instanceId);
        await instance.close();
    },

    // Not written by hand. Every agent-visible tRPC procedure becomes an action
    // with its zod input converted to JSON Schema, dispatched through the same
    // validated caller the panel's buttons use. Adding a procedure adds an
    // action; the two cannot drift.
    //
    // `list` is kept hand-written: the panel's `getState` returns every image
    // (413 here), which is right for a grid and wrong for a transcript, so the
    // agent gets a summarised, limited view instead.
    actions: [
        {
            name: "list",
            description: "Read the current containers and images from the local runtime.",
            inputSchema: {
                type: "object",
                properties: {
                    kind: { type: "string", enum: ["containers", "images", "all"], description: "What to return. Defaults to all." },
                    limit: { type: "integer", minimum: 1, maximum: 500, description: "Max rows per list. Defaults to 50." },
                },
                additionalProperties: false,
            },
            handler: async (ctx) => {
                const instance = instanceFor(ctx.instanceId);
                const state = instance.getState() ?? (await instance.refresh());
                const limit = ctx.input?.limit ?? 50;
                const kind = ctx.input?.kind ?? "all";
                return {
                    runtime: state.runtime ? { name: state.runtime.bin, version: state.runtime.version } : null,
                    counts: { containers: state.containers.length, images: state.images.length },
                    containers: kind === "images" ? undefined : state.containers.slice(0, limit),
                    images: kind === "containers" ? undefined : state.images.slice(0, limit),
                };
            },
        },
        ...buildCanvasActions({
            describe: describeAgentActions,
            call: (instanceId, name, input) => instanceFor(instanceId).callProcedure(name, input),
            instanceFor,
        }),
    ],
});

session = await joinSession({ canvases: [canvas] });

process.on("exit", () => {
    for (const instance of instances.values()) instance.close().catch(() => { });
});
