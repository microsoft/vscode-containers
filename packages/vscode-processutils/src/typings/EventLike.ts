/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import type * as jsonrpc from 'vscode-jsonrpc';
import { DisposableLike } from './DisposableLike';

/**
 * Defined to reflect the fact that the events could be from either `vscode`
 * (in the case of VSCode extensions), or `vscode-jsonrpc` (in the case of ServiceHub
 * workers in VS).
 */
export interface EventLike<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-function-type
    (listener: (e: T) => any, thisArgs?: any, disposables?: DisposableLike[]): DisposableLike;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EventLike {
    /**
     * An instance of {@link EventLike} that will never fire, but meets the interface
     */
    export const None: EventLike<void> = Object.freeze(() => {
        return DisposableLike.None;
    }) satisfies vscode.Event<void> & jsonrpc.Event<void>; // The `satisfies` ensures that the type matches both vscode and vscode-jsonrpc `Event` interfaces
}
