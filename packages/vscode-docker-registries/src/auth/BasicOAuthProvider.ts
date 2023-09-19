/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthenticationProvider } from '../contracts/AuthenticationProvider';
import { RequestLike, httpRequest } from '../utils/httpRequest';
import { BasicAuthProvider } from './BasicAuthProvider';
import { LoginInformation } from '../contracts/BasicCredentials';

export class BasicOAuthProvider extends BasicAuthProvider implements AuthenticationProvider {
    private oAuthEndpoint: string | undefined;
    private oAuthService: string | undefined;
    private defaultScopes: string[] | undefined;
    private _didFallback: boolean = false;

    public constructor(storageMemento: vscode.Memento, secretStorage: vscode.SecretStorage, private readonly registryUri: vscode.Uri) {
        super(storageMemento, secretStorage, registryUri.toString());
    }

    public async getSession(scopes: string[], options?: vscode.AuthenticationGetSessionOptions): Promise<vscode.AuthenticationSession & { type: string }> {
        const { username, secret } = await this.getBasicCredentials();

        if (this.oAuthEndpoint === undefined || this.oAuthService === undefined) {
            return {
                id: 'basic',
                type: 'Basic',
                account: {
                    label: username,
                    id: username,
                },
                accessToken: this.getBasicAuthToken(username, secret),
                scopes: scopes,
            };
        } else {
            const request: RequestLike = {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${this.getBasicAuthToken(username, secret)}`,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'grant_type': 'password',
                    'service': this.oAuthService,
                    'scope': [...this.defaultScopes ?? [], ...scopes].join(' '),
                },
            };

            const oAuthResponse = await httpRequest<{ token: string }>(this.oAuthEndpoint.toString(), request);

            return {
                id: 'oauth',
                type: 'Bearer',
                account: {
                    label: username,
                    id: username,
                },
                accessToken: (await oAuthResponse.json()).token,
                scopes: scopes,
            };

        }
    }

    public fallback(wwwAuthenticateHeader: string): void {
        const wwwAuthenticateHeaderRegex = /Bearer\s+realm="(?<realm>[^"]+)",\s*service="(?<service>[^"]+)",\s*scope="(?<scope>[^"]+)"/i;

        const match = wwwAuthenticateHeaderRegex.exec(wwwAuthenticateHeader);

        if (!match?.groups?.realm || !match?.groups?.service || !match?.groups?.scope) {
            throw new Error(vscode.l10n.t('Unable to parse WWW-Authenticate header: "{0}"', wwwAuthenticateHeader));
        }

        this.oAuthEndpoint = match.groups.realm;
        this.oAuthService = match.groups.service;
        this.defaultScopes = match.groups.scope.split(' ');
        this._didFallback = true;
    }

    public get didFallback(): boolean {
        return this._didFallback;
    }

    public async getLoginInformation(): Promise<LoginInformation> {
        const credentials = await this.getBasicCredentials();

        return {
            server: this.registryUri.toString(),
            username: credentials.username,
            secret: credentials.secret,
        };
    }

    private getBasicAuthToken(username: string, secret: string): string {
        return Buffer.from(`${username}:${secret}`).toString('base64');
    }
}

export function isBasicOAuthProvider(maybeProvider: unknown): maybeProvider is BasicOAuthProvider {
    return maybeProvider instanceof BasicOAuthProvider;
}
