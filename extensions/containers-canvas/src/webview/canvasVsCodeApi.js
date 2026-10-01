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
     * RPCs wait for the reply channel.
     *
     * A reply is delivered down the SSE stream, so the host needs a sink before
     * `/rpc` runs. During startup and reconnect the POST could beat the stream
     * open, and the reply was written to nothing -- the request appeared to
     * succeed while the calling UI waited for a response that no longer existed.
     *
     * Bounded because a server that never comes back must not grow this without
     * limit; the oldest call is dropped first, and the disconnected banner is
     * what tells the user why nothing is responding.
     */
    const MAX_QUEUED = 64;
    let queued = [];

    const post = (message) => {
        // Fire and forget, but not unhandled. This shim exists to notice the
        // loopback server going away, and that is precisely when the POST
        // rejects — so without a catch the failure it is watching for
        // surfaces as an unhandled rejection instead. The SSE stream's own
        // error handling is what reports the disconnection; here the
        // rejection only needs to be swallowed deliberately.
        void fetch(panelHref("./rpc"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message),
        }).catch(() => { /* reported through the connection state, not here */ });
    };

    const flushQueue = () => {
        if (queued.length === 0) return;
        const pending = queued;
        queued = [];
        for (const message of pending) post(message);
    };

    /*
     * Detect a panel whose server is gone.
     *
     * Each canvas instance gets a fresh loopback port, so reloading the
     * extension leaves any panel that was not re-opened pointing at a dead one.
     * EventSource retries forever and silently, so the panel just sits there
     * looking broken with no explanation -- and the fix (re-open the canvas)
     * is not something the page can do for itself.
     *
     * A single failed reconnect is normal, so a retryable failure is only
     * reported once the stream has been down long enough to mean the server is
     * really gone. That grace period is a cancellable timer rather than a check
     * on the next error: a terminal failure such as `/events` answering 403
     * moves straight to CLOSED and never retries, so a second error never
     * arrives and the disconnected banner was never shown at all.
     */
    let downTimer = null;
    let opened = false;

    const clearDownTimer = () => {
        if (downTimer !== null) {
            clearTimeout(downTimer);
            downTimer = null;
        }
    };

    source.addEventListener("open", () => {
        clearDownTimer();
        opened = true;
        flushQueue();
        onControl({ type: "connection", ok: true });
    });

    source.addEventListener("error", () => {
        opened = false;
        if (source.readyState === EventSource.CLOSED) {
            // Terminal: no further error or open event is coming.
            clearDownTimer();
            onControl({ type: "connection", ok: false });
            return;
        }
        if (source.readyState === EventSource.CONNECTING && downTimer === null) {
            downTimer = setTimeout(() => {
                downTimer = null;
                onControl({ type: "connection", ok: false });
            }, 4000);
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
            // Until the stream is open there is nowhere for the reply to go.
            if (!opened) {
                if (queued.length >= MAX_QUEUED) queued.shift();
                queued.push(message);
                return;
            }
            post(message);
        },
        dispose() {
            clearDownTimer();
            queued = [];
            source.close();
        },
    };
}
