/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Extension: containers-canvas
//
// The plugin's entry point. It declares the Containers canvas, registers the
// agent actions that can drive it, and joins the Copilot session. A plugin's
// extensions are discovered under `com.github.copilot/extensions/<id>/`, so the
// file there re-imports this one rather than duplicating it.
//
// Each open panel gets its own loopback server (`startCanvasServer`). The React
// and Fluent UI that server hosts talks back to it with tRPC, carried over HTTP
// POST and SSE instead of a VS Code webview channel, through the shim in
// `src/webview/canvasVsCodeApi.js`.
//
// That transport is why `@microsoft/vscode-ext-webview` is a dependency:
// `initWebviewTrpc`, `attachTrpc` and `connectTrpc` are all used, on both
// halves. Its host barrel eagerly requires `vscode`, which does not exist
// outside VS Code, and that is in turn why the build aliases the bare `vscode`
// specifier to `src/vscode-stub.mjs`.
//
// The import below is `./bundle/host.mjs` -- the committed build output -- and
// not `src/`, because a plugin is installed straight from a git ref with no
// build step. The bundle is what actually runs.

import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";


import { startCanvasServer, describeAgentActions, buildCanvasActions, summariseState } from "./bundle/host.mjs";
// Not imported through the bundle: this is entry-point logic, not panel logic,
// and keeping it a plain sibling means it stays readable next to the canvas
// declaration it serves. `src/` cannot hold it either -- this module joins the
// Copilot session on import, so a test can only reach it from outside.
import { openPanel } from "./openPanel.mjs";

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
        const existing = instances.get(ctx.instanceId);
        let instance = existing;
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

        try {
            return await openPanel(ctx, instance, { CanvasError });
        } catch (error) {
            // `onClose` only runs for a canvas that opened, so a validation
            // failure here would strand the loopback server this call just
            // started. A panel that was already open is left alone.
            if (!existing) {
                instances.delete(ctx.instanceId);
                await instance.close().catch(() => { });
            }
            throw error;
        }
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
            description:
                "Read the current containers and images from the local runtime. " +
                "If a list could not be read it comes back as {unavailable: true, reason}, with a null count " +
                "and an `error` field -- report that failure rather than saying there is nothing there.",
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
                return summariseState(state, {
                    kind: ctx.input?.kind ?? "all",
                    limit: ctx.input?.limit ?? 50,
                });
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
