/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Request, default as fetch, Headers } from "node-fetch";
import { RegistryV2 } from "../RegistryV2";
import { CancellationToken } from "vscode";
import { asCancellable } from "./asCancellable";
import { RegistryV2Response } from "./RegistryV2Responses";

/**
 * OAuth authentication context
 */
export interface AuthContext {
    realm: string;
    service: string;
}

/**
 * Makes a standard request to a V2 registry
 * @param method The request method (GET / POST / DELETE)
 * @param registry The registry to make the request to
 * @param path The subpath for the request
 * @param scope The OAuth scope of the request
 * @param token Cancellation token
 * @param throwOnFailure Whether failures should be thrown or returned
 */
export async function registryV2Request<T>(method: 'GET' | 'POST' | 'DELETE', registry: RegistryV2, path: string, scope: string, token: CancellationToken, throwOnFailure = true): Promise<RegistryV2Response<T>> {
    const request = new Request(`${registry.registryUrl.toString()}/${path}`, { method: method });

    await registry.signRequest(request, scope, token);
    const response = await asCancellable(fetch(request), token);

    if (throwOnFailure && (response.status < 200 || response.status >= 300)) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const headers: { [key: string]: string } = {};
    response.headers.forEach((value, name) => headers[name.toLowerCase()] = value);

    return {
        status: response.status,
        statusText: response.statusText,
        succeeded: response.status >= 200 && response.status < 300,
        body: headers['content-length'] && Number(headers['content-length']) ? await response.json() as T : {} as T,
        headers: headers,
    };
}

/**
 * Exchanges basic auth for an OAuth token for a specific resource
 * @param registry The registry to make the request to
 * @param context The OAuth authentication context
 * @param scope The OAuth scope for the requested token
 * @param cancelToken Cancellation token
 * @internal
 */
export async function getOAuthTokenFromBasic(registry: RegistryV2, context: AuthContext, scope: string, cancelToken: CancellationToken): Promise<string> {
    const oAuthHeaders = new Headers({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'Content-Type': 'x-www-form-urlencoded',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'grant_type': 'password',
        'service': context.service,
        'scope': scope,
    });

    const request = new Request(context.realm, { method: 'POST', headers: oAuthHeaders });

    await registry.signRequestBasic(request, cancelToken);

    const response = await asCancellable(fetch(request), cancelToken);

    if (response.status >= 200 && response.status < 300) {
        const body = await response.json() as { token: string };
        return body.token;
    } else {
        throw new Error(`Failed to acquire OAuth token. Status Code: ${response.status}, Status: ${response.statusText}`);
    }
}

/**
 * Given a registry response, fetches the OAuth context from the WWW-Authenticate header
 * @param response The response to parse the auth context from
 * @internal
 */
export function getAuthContext(response: RegistryV2Response<unknown>): AuthContext | undefined {
    const realmRegExp = /realm="([^"]+)"/i;
    const serviceRegExp = /service="([^"]+)"/i;

    if (response.status === 401) {
        const wwwAuthHeader = response?.headers?.['www-authenticate'];

        const realmMatch = wwwAuthHeader?.match(realmRegExp);
        const serviceMatch = wwwAuthHeader?.match(serviceRegExp);

        if (realmMatch?.[1] && serviceMatch?.[1]) {
            return {
                realm: realmMatch?.[1],
                service: serviceMatch?.[1],
            };
        }
    }

    return undefined;
}
