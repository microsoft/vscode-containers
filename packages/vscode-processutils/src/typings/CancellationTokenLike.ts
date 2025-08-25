/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import type * as jsonrpc from 'vscode-jsonrpc';
import { DisposableLike } from './DisposableLike';
import { EventLike } from './EventLike';

/**
 * Defined to reflect the fact that the cancellation tokens could be from either `vscode`
 * (in the case of VSCode extensions), or `vscode-jsonrpc` (in the case of ServiceHub
 * workers in VS).
 */
export interface CancellationTokenLike {
    isCancellationRequested: boolean;
    onCancellationRequested: EventLike<void>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace CancellationTokenLike {
    /**
     * An instance of {@link CancellationTokenLike} that will never actually cancel, but meets the interface
     */
    export const None: CancellationTokenLike = Object.freeze({
        isCancellationRequested: false,
        onCancellationRequested: EventLike.None,
    }) satisfies vscode.CancellationToken & jsonrpc.CancellationToken; // The `satisfies` ensures that the type matches both vscode and vscode-jsonrpc `CancellationToken` interfaces

    /**
     * Turns an {@link AbortSignal} into a {@link CancellationTokenLike}
     * @param abortSignal The signal to convert
     * @returns A {@link CancellationTokenLike} that reflects the state of the {@link AbortSignal}
     */
    export function fromAbortSignal(abortSignal: AbortSignal): CancellationTokenLike {
        return {
            get isCancellationRequested(): boolean {
                return abortSignal.aborted;
            },

            onCancellationRequested: (listener, thisArgs, disposables) => {
                if (abortSignal.aborted) {
                    // If already aborted, invoke listener asynchronously and return a disposable that cancels the scheduled call
                    const handle = setTimeout(() => {
                        listener.call(thisArgs);
                    }, 0);

                    const d: DisposableLike = {
                        dispose: () => clearTimeout(handle),
                    };

                    disposables?.push(d);
                    return d;
                } else {
                    // Otherwise do it like normal
                    const handler = () => {
                        listener.call(thisArgs);
                    };

                    abortSignal.addEventListener('abort', handler);

                    const d: DisposableLike = {
                        dispose: () => abortSignal.removeEventListener('abort', handler),
                    };

                    disposables?.push(d);
                    return d;
                }
            }
        };
    }
}
