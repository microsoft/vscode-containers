/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Host bundle entry point. Everything VS Code-shaped is contained here.

import { attachTrpc } from "@microsoft/vscode-ext-webview/host";

import { createAppRouter, trpc, loadState, AGENT_META } from "./appRouter.mjs";
import { createStubPanel } from "./stubPanel.mjs";
import { describeProcedures, buildCanvasActions } from "./agentActions.mjs";
import { findTarget, followLogs, followStats, detectRuntime, watchChanges, loadContainers } from "./runtime.mjs";

export { buildCanvasActions };

/**
 * Describe the agent-visible procedures without starting a panel.
 *
 * Canvas actions must be declared when the extension registers, before any
 * instance exists, so this builds a throwaway router purely to read its shape.
 * The cache and host deps are never touched -- only names, types and schemas.
 */
export function describeAgentActions() {
    const router = createAppRouter({ get: () => null, refresh: async () => null }, {});
    return describeProcedures(router, AGENT_META);
}

/**
 * Wire the tRPC router to a loopback transport instead of a `vscode.WebviewPanel`.
 *
 * The runtime cache lives here rather than in the server so the router and the
 * SSE pushes share one view of the world: a mutation refreshes it, and every
 * connected iframe is told about the new state through the same panel stub.
 *
 * `sendToChat` is passed down so the router can hand a target to Copilot using
 * evidence it gathers itself rather than prose from the UI.
 */
export function createRpcBridge({ onState, sendToChat, workingDirectory } = {}) {
    const stub = createStubPanel();

    let state = null;
    const cache = {
        get: () => state,
        async refresh({ force = true } = {}) {
            state = await loadState({ force });
            onState?.(state);
            // Non-tRPC frame: no `id`, so the library's dispatcher ignores it and
            // the webview picks it up as a state push.
            stub.broadcast({ type: "canvas:state", state });
            return state;
        },
    };

    /*
     * What a push is worth telling the panel about.
     *
     * The watcher fires for changes this panel may already have caused, and the
     * poll cannot tell those apart. Pushing regardless would replace every row
     * object on a timer, so a reload only reaches the iframe when one of the
     * rendered fields actually moved.
     */
    const signatureOf = (value) => JSON.stringify({
        error: value?.error ?? null,
        runtime: value?.runtime?.bin ?? null,
        containers: (value?.containers ?? []).map((c) => [c.id, c.state, c.status, c.ports, c.name]),
        images: (value?.images ?? []).map((i) => [i.id, i.ref, i.size]),
    });

    let reconciling = null;
    let missedChange = false;
    // Set when a pending change could have touched images, which a container
    // event never can. Container events then reload the cheap half only.
    let needsFullReload = true;

    /** Reload because something outside this panel changed. Quiet when it did not. */
    const reconcile = async () => {
        // Several panels and several reasons can land at once; one reload
        // answers all of them, and `loadState` already shares the docker call.
        //
        // Joining an in-flight reload is not enough on its own: a reload takes
        // seconds, and a change that lands midway may already have been missed
        // by the read it is joining. `docker stop` shows this plainly -- it
        // emits `kill` immediately and `die` up to ten seconds later -- so the
        // second change has to force another pass rather than ride on the first.
        if (reconciling) {
            missedChange = true;
            return reconciling;
        }
        reconciling = (async () => {
            let latest = state;
            do {
                missedChange = false;
                const full = needsFullReload || !state;
                needsFullReload = false;

                const before = signatureOf(state);
                if (full) {
                    latest = await loadState({ force: true });
                } else {
                    const containers = await loadContainers();
                    latest = containers
                        ? { ...state, containers, loadedAt: new Date().toISOString() }
                        : await loadState({ force: true });
                }
                state = latest;
                if (signatureOf(latest) !== before) {
                    onState?.(latest);
                    stub.broadcast({ type: "canvas:state", state: latest });
                }
            } while (missedChange);
            return latest;
        })().finally(() => {
            reconciling = null;
        });
        return reconciling;
    };

    const unwatch = watchChanges((change) => {
        // Only a container event is safe to answer with a partial reload. The
        // poll compares containers alone, so it cannot vouch for images either.
        if (!(change.reason === "event" && change.type === "container")) needsFullReload = true;
        void reconcile().catch(() => {
            // A failed reload is not worth tearing the watcher down for: the
            // next event or poll will try again.
        });
    });

    // Every command run through this canvas is kept and pushed to the panel. A
    // command executed on someone's behalf has to be visible to them, not just
    // returned to whoever asked for it.
    const execLog = [];

    const router = createAppRouter(cache, {
        sendToChat,
        workingDirectory,
        findTarget: (target) => findTarget(state ?? { containers: [], images: [] }, target),
        recordExec: (entry) => {
            const record = { ...entry, at: new Date().toISOString() };
            execLog.push(record);
            if (execLog.length > 200) execLog.shift();
            stub.broadcast({ type: "exec", entry: record });
        },
    });
    // Context is the framework's `BaseRouterContext`; attachTrpc shallow-clones
    // it per operation and injects a fresh AbortSignal.
    const attached = attachTrpc(stub.panel, {}, router, trpc.createCallerFactory);

    // The same router, callable server-side. Agent actions go through this, so
    // they run the identical zod-validated procedures the panel's buttons do.
    const caller = trpc.createCallerFactory(router)({});

    return {
        deliver: stub.deliver,
        addSink: stub.addSink,
        getState: cache.get,
        refresh: cache.refresh,
        /** Push a non-tRPC control frame (state, focus) to connected iframes. */
        broadcast: stub.broadcast,
        /** Commands run through this canvas, oldest first. */
        getExecLog: () => execLog,
        /** `[{ name, type, description, inputSchema }]` for agent-visible procedures. */
        describeProcedures: () => describeProcedures(router, AGENT_META),
        /** Invoke a procedure by name with already-parsed input. */
        callProcedure: (name, input) => {
            const procedure = caller[name];
            if (typeof procedure !== "function") throw new Error(`Unknown procedure "${name}".`);
            return procedure(input);
        },
        dispose: () => {
            unwatch();
            attached.disposable.dispose();
        },
    };
}

/*
 * Re-exported so the unbundled server can reach the runtime through this
 * bundle rather than importing `runtime.mjs` a second time.
 *
 * Two import paths would mean two module instances, and the runtime holds
 * process-wide state: the in-flight load used for request coalescing and the
 * mutation counter that guards it. A second copy would quietly reintroduce the
 * duplicate-`docker images` storm that coalescing exists to prevent.
 */
export { findTarget, followLogs, followStats, detectRuntime };