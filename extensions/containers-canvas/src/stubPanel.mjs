/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// A structural stand-in for `vscode.WebviewPanel`.
//
// `attachTrpc` imports `vscode` as types only and touches exactly two members:
//
//   panel.webview.onDidReceiveMessage(handler) -> Disposable
//   panel.webview.postMessage(message)         -> Thenable<boolean>
//
// So the host-side VS Code coupling collapses to the object below. Inbound
// `{ id, op }` frames arrive over HTTP POST and are handed to the dispatcher;
// outbound frames are fanned out to every attached sink (one per SSE stream).

export function createStubPanel() {
    const listeners = new Set();
    const sinks = new Set();

    const broadcast = (message) => {
        for (const sink of sinks) {
            try {
                sink(message);
            } catch {
                // A dead stream must never break the dispatcher.
            }
        }
    };

    return {
        panel: {
            webview: {
                onDidReceiveMessage(handler) {
                    listeners.add(handler);
                    return { dispose: () => listeners.delete(handler) };
                },
                postMessage(message) {
                    broadcast(message);
                    return Promise.resolve(true);
                },
            },
        },

        /** Feed an inbound transport frame from the iframe into the dispatcher. */
        deliver(message) {
            for (const handler of listeners) void handler(message);
        },

        /** Attach an outbound sink (one per SSE connection). Returns a detach fn. */
        addSink(sink) {
            sinks.add(sink);
            return () => sinks.delete(sink);
        },

        /** Push a non-tRPC frame to the iframe (state pushes, invalidation). */
        broadcast,
    };
}
