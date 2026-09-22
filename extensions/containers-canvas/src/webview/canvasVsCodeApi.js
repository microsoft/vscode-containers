/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// A structural stand-in for `acquireVsCodeApi()`.
//
// `connectTrpc(vscodeApi)` declares its parameter as:
//
//   interface VsCodeApiLike { postMessage(message: unknown): void }
//
// ...and reads responses off `window.addEventListener("message", ...)`. Neither
// half is bound to VS Code, so a canvas iframe satisfies both with ordinary HTTP:
//
//   outbound  postMessage(frame)  -> POST /rpc
//   inbound   GET /events (SSE)   -> re-dispatched via window.postMessage
//
// Re-dispatching is what makes this work without patching the library: its own
// listener is already on the window bus, so replaying server frames there lands
// them in the tRPC response path untouched.

import { panelHref } from "./panelUrl.js";

/**
 * @param {(state: unknown) => void} [onState] receives non-tRPC state pushes
 * @param {(frame: object) => void} [onControl] receives other control frames,
 *   such as the focus frame sent when the agent deep-links the panel
 */
export function createCanvasVsCodeApi(onState = () => {}, onControl = () => {}) {
    const source = new EventSource(panelHref("./events"));

    /*
     * Detect a panel whose server is gone.
     *
     * Each canvas instance gets a fresh loopback port, so reloading the
     * extension leaves any panel that was not re-opened pointing at a dead one.
     * EventSource retries forever and silently, so the panel just sits there
     * looking broken with no explanation -- and the fix (re-open the canvas)
     * is not something the page can do for itself.
     *
     * A single failed reconnect is normal, so this only reports after the
     * stream has been down long enough to mean the server is really gone.
     */
    let downSince = null;
    source.addEventListener("open", () => {
        downSince = null;
        onControl({ type: "connection", ok: true });
    });
    source.addEventListener("error", () => {
        if (source.readyState === EventSource.CLOSED || source.readyState === EventSource.CONNECTING) {
            if (downSince === null) downSince = Date.now();
            else if (Date.now() - downSince > 4000) onControl({ type: "connection", ok: false });
        }
    });

    source.addEventListener("message", (event) => {
        let frame;
        try {
            frame = JSON.parse(event.data);
        } catch {
            return;
        }

        // Control frames carry no `id`; the library's structural guard ignores
        // them, so they can safely share the same bus as tRPC replies.
        if (frame && typeof frame === "object" && frame.type === "canvas:state") {
            onState(frame.state);
            return;
        }
        // Any other typed, id-less frame is a control message for the app.
        // Without this branch they were forwarded to the window bus and then
        // silently dropped by tRPC's guard, which is why the canvas could not
        // be deep-linked.
        if (frame && typeof frame === "object" && typeof frame.type === "string" && frame.id === undefined) {
            onControl(frame);
            return;
        }

        window.postMessage(frame, "*");
    });

    return {
        postMessage(message) {
            void fetch(panelHref("./rpc"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(message),
            });
        },
        dispose() {
            source.close();
        },
    };
}
