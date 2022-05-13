/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export class CommandNotSupportedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}