/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from "vscode";

/**
 * Error thrown when an operation is cancelled
 */
export class CancelError extends Error {
    public constructor() {
        super('Operation cancelled.');
    }
}

/**
 * Wraps a promise that does not accept cancellation tokens so that it can be cancelled
 * @param callback The async method to execute
 * @param token Cancellation token
 */
export async function asCancellable<T>(callback: Promise<T>, token: CancellationToken): Promise<T> {
    const cancellablePromise = new Promise<never>((resolve, reject) => {
        // TODO: I don't think this disposes if the callback finishes first
        const disposable = token.onCancellationRequested(() => {
            disposable.dispose();
            reject(new CancelError());
        });
    });

    return Promise.race<T>([cancellablePromise, callback]);
}
