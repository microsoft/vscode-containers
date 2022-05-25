/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class CommandNotSupportedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}
