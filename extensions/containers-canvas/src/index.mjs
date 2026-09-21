/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// The single bundled entry point for the extension host.
//
// Everything the extension needs at runtime is reachable from here, so the
// shipped package is `extension.mjs` plus one `bundle/host.mjs` and the webview
// assets -- no node_modules required.
//
// One entry rather than two matters for correctness, not just tidiness: the
// runtime adapter holds process-wide state (the in-flight load used for request
// coalescing, and the mutation counter guarding it). Bundling it into two
// separate files would create two module instances and silently reintroduce the
// duplicate-`docker images` storm that coalescing exists to prevent.

export { createRpcBridge, describeAgentActions, findTarget, followLogs, followStats, detectRuntime } from "./host-entry.mjs";
export { buildCanvasActions } from "./agentActions.mjs";
export { startCanvasServer } from "../server.mjs";
