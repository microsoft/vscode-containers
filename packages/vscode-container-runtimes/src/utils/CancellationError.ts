/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from 'vscode-jsonrpc';

export class CancellationError extends Error {
    constructor(message: string, public readonly token?: CancellationToken) {
        super(message);
        this.name = this.constructor.name;
    }
}
