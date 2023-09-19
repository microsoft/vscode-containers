/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class UnauthorizedError extends Error {
    readonly name: 'UnauthorizedError';
    constructor(message: string) {
        super(message);
        this.name = 'UnauthorizedError';
    }
}

export function isUnauthorizedError(error: unknown): error is UnauthorizedError {
    return !!error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'UnauthorizedError';
}
