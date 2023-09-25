/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Request, RequestInit, Response, ResponseInit, default as fetch } from 'node-fetch';
import { HttpErrorResponse, UnauthorizedError } from './errors';

export function getNextLinkFromHeaders(headers: HeadersLike, baseUrl: vscode.Uri): vscode.Uri | undefined {
    const linkHeader: string | undefined = headers['link'];
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

export type HeadersLike = Record<string, string>;

export type RequestLike = RequestInit & {
    headers: HeadersLike;
};

export type ResponseLike<T> = ResponseInit & {
    headers: HeadersLike;
    status: number;
    statusText: string;
    succeeded: boolean;
    json: () => Promise<T>;
};

export async function httpRequest<T>(url: string, request: RequestLike, throwOnFailure: boolean = true): Promise<ResponseLike<T>> {
    const fetchRequest = new Request(url, request);
    const response: Response = await fetch(fetchRequest);

    const headers: HeadersLike = {};
    for (const [header, value] of response.headers.entries()) {
        headers[header] = value;
    }

    const succeeded = response.status >= 200 && response.status < 300;

    if (throwOnFailure && response.status === 401) {
        throw new UnauthorizedError(vscode.l10n.t('Request to \'{0}\' failed with response 401: Unauthorized', url));
    } else if (throwOnFailure && !succeeded) {
        throw new HttpErrorResponse(url, response.status, response.statusText);
    }

    return {
        ...response,
        headers: headers,
        status: response.status,
        statusText: response.statusText,
        succeeded: succeeded,
        json: response.json.bind(response),
    };
}
