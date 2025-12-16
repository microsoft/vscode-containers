/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenLike } from '../typings/CancellationTokenLike';

export class CancellationError extends Error {
    constructor(message: string, public readonly token?: CancellationTokenLike) {
        super(message);
        this.name = this.constructor.name;
    }
}

export function isCancellationError(err: unknown): err is CancellationError {
    return !!err && typeof err === 'object' && 'name' in err && err.name === CancellationError.name;
}
