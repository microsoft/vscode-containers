/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the extension entrypoint, which imports extension.bundle.mjs, the actual extension code.
//
// This is in a separate file so we can properly measure extension.bundle.mjs load time.

const perfStats = {
    loadStartTime: Date.now(),
    loadEndTime: undefined
};

const extension = await import("./dist/extension.bundle.mjs");

export async function activate(ctx) {
    return await extension.activateInternal(ctx, perfStats);
}

export async function deactivate(ctx) {
    return await extension.deactivateInternal(ctx);
}

perfStats.loadEndTime = Date.now();
