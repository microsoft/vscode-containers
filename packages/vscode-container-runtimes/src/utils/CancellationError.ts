/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vscode-jsonrpc';

export class CancellationError extends Error {
    constructor(message: string, public readonly token?: CancellationToken) {
        super(message);
        this.name = this.constructor.name;
    }
}
