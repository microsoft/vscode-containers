/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import type * as jsonrpc from 'vscode-jsonrpc';

// TODO: Should we redefine it or is this union OK?
export type CancellationTokenLike = vscode.CancellationToken | jsonrpc.CancellationToken;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace CancellationTokenLike {
    /**
     * An instance of {@link CancellationTokenLike} that will never actually cancel, but meets the interface
     */
    export const None: CancellationTokenLike = {
        isCancellationRequested: false,
        onCancellationRequested: () => {
            return {
                dispose: () => {
                    // Noop, not a real registration
                }
            };
        },
    };
}
