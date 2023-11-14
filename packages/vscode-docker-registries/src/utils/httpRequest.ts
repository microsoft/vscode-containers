/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { HttpErrorResponse, UnauthorizedError } from './errors';

export function getNextLinkFromHeaders(headers: Headers, baseUrl: vscode.Uri): vscode.Uri | undefined {
    const linkHeader = headers.get('link');
    if (!linkHeader) {
        return undefined;
    }

    const match = linkHeader.match(/<(.*)>; rel="next"/i);
    if (!match) {
        return undefined;
    }

    const headerUri = vscode.Uri.parse(match[1]);
    const nextLinkUri = baseUrl.with({ path: headerUri.path, query: headerUri.query });
    return nextLinkUri;
}

export type HeadersLike = Headers;

export type RequestLike = RequestInit & {
    headers: Record<string, string>;
};

export interface ResponseLike<T> extends Response {
    headers: HeadersLike;
    status: number;
    statusText: string;
    succeeded: boolean;
    json: () => Promise<T>;
}

export async function httpRequest<T>(url: string, request: RequestLike, throwOnFailure: boolean = true): Promise<ResponseLike<T>> {
    const fetchRequest = new Request(url, request);
    const response: Response = await fetch(fetchRequest);

    if (throwOnFailure && response.status === 401) {
        throw new UnauthorizedError(vscode.l10n.t('Request to \'{0}\' failed with response 401: Unauthorized', url));
    } else if (throwOnFailure && !response.ok) {
        throw new HttpErrorResponse(url, response.status, response.statusText);
    }

    return {
        ...response,
        headers: response.headers, // These are getters so we need to call them to get the values
        status: response.status,
        statusText: response.statusText,
        succeeded: response.ok,
        json: response.json.bind(response) as () => Promise<T>,
    };
}
