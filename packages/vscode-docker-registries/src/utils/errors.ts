/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { l10n } from "vscode";

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

export class HttpErrorResponse extends Error {
    public constructor(public readonly url: string, public readonly status: number, public readonly statusText: string) {
        super(l10n.t('Request to {0} failed with status {1}: {2}', url, status, statusText));
    }

    // This method lets parseError from @microsoft/vscode-azext-utils get the HTTP status code as the error code
    public get code(): number {
        return this.status;
    }
}
