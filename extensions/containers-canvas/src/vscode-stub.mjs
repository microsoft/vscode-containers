/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// esbuild aliases the bare `vscode` specifier to this module.
//
// `attachTrpc` needs `vscode` only as types, but the runtime dependency comes
// from the barrel: `@microsoft/vscode-ext-webview/host` eagerly requires
// `WebviewController` and `openWebview`, which both `require('vscode')` at load
// time. The package's `exports` map has no deep entry for `./host/attachTrpc`,
// so the barrel cannot be bypassed -- hence this stub.
//
// Nothing here is ever dereferenced by the paths this extension uses. If one of
// these throws, the adapter has drifted onto a VS Code-only code path.

const unavailable = (name) => () => {
    throw new Error(`containers-canvas: 'vscode.${name}' is not available outside VS Code.`);
};

export const EventEmitter = unavailable("EventEmitter");
export const Uri = {
    parse: unavailable("Uri.parse"),
    file: unavailable("Uri.file"),
    joinPath: unavailable("Uri.joinPath"),
};
export const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 };
export const ExtensionMode = { Production: 1, Development: 2, Test: 3 };
export const window = { createWebviewPanel: unavailable("window.createWebviewPanel") };
export const l10n = { t: (message) => message };

export default { EventEmitter, ExtensionMode, Uri, ViewColumn, l10n, window };
