/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Resolves what a canvas `open` call should focus, and what to report back.
//
// Separate from `extension.mjs` because that module joins the Copilot session
// on import and so cannot be loaded by the test runner. This is the branchiest
// logic in the entry point -- target resolution, view/kind compatibility, and
// the fallback when a per-target view arrives without a target -- so it is the
// part most worth pinning down.
//
// `CanvasError` is injected rather than imported: it comes from the host SDK,
// which is not available to the bundle.

/** Views that only make sense for a container, and what they show. */
const CONTAINER_ONLY = {
    logs: "logs",
    stats: "resource usage",
    files: "a filesystem",
    terminal: "a shell",
    exec: "a command runner",
};

/** Views that only make sense for an image. */
const IMAGE_ONLY = ["layers", "dockerfile"];

export async function openPanel(ctx, instance, { CanvasError }) {
    let state = instance.getState();
    // Same lesson as the other canvas: "unreachable" is the status most likely
    // to be stale, because the usual reason to reopen is that the runtime was
    // just started.
    if (state?.runtime && !state.runtime.available) {
        state = (await instance.refresh({ force: true })) ?? state;
    }

    // Resolve the target here rather than shipping the raw string to the
    // iframe: the host owns the list, so a name that does not match should be
    // an error the agent sees, not a panel that silently opens on nothing.
    let focus = null;
    // Set when a per-target view was asked for without a target. The panel
    // still opens on the list, but the agent is told the view was not applied
    // instead of being left to assume it was.
    let unapplied = null;

    if (ctx.input?.target) {
        const target = instance.findTarget(ctx.input.target);
        if (!target) {
            throw new CanvasError(
                "canvas_target_not_found",
                `No container or image matches "${ctx.input.target}".`,
            );
        }
        const requested = ctx.input.view ?? "details";
        if (IMAGE_ONLY.includes(requested) && target.kind !== "image") {
            throw new CanvasError(
                "canvas_invalid_view",
                `"${ctx.input.target}" is a container; layers belong to images. Use its image reference instead.`,
            );
        }
        if (CONTAINER_ONLY[requested] && target.kind !== "container") {
            throw new CanvasError(
                "canvas_invalid_view",
                `"${ctx.input.target}" is an image; only containers have ${CONTAINER_ONLY[requested]}.`,
            );
        }
        focus = { type: "focus", view: requested, target, tab: target.kind === "image" ? "images" : "containers" };
    } else if (ctx.input?.view === "list" || ctx.input?.tab) {
        focus = { type: "focus", view: "list", tab: ctx.input.tab };
    } else if (ctx.input?.view) {
        // Every remaining view shows one container or image. This used to be
        // dropped in silence, leaving whatever pane was already there while the
        // agent believed it had opened resource usage. Opening the list is the
        // useful fallback, but it has to be said out loud.
        unapplied = ctx.input.view;
        focus = { type: "focus", view: "list", tab: undefined };
    }
    if (focus) instance.broadcast(focus);

    const running = (state?.containers ?? []).filter((c) => c.state === "running").length;
    const runtimeStatus = state?.runtime
        ? `${state.runtime.bin}${state.runtime.available ? ` · ${running} running` : " · unreachable"}`
        : "no runtime detected";

    return {
        title: focus?.target
            ? `Containers · ${focus.target.name ?? focus.target.ref ?? focus.target.shortId}`
            : "Containers",
        url: instance.url,
        status: unapplied
            ? `${runtimeStatus} · showing the list: "${unapplied}" needs a target, so pass one to open it`
            : runtimeStatus,
    };
}
