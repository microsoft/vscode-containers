/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export class ChildProcessError extends Error {
    constructor(message: string, public readonly code: number | null, public readonly signal: NodeJS.Signals | null) {
        super(message);
        this.name = this.constructor.name;
    }
}