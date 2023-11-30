/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthenticationProvider } from '../contracts/AuthenticationProvider';
import { LoginInformation } from '../contracts/BasicCredentials';
import { DockerHubRequestUrl, DockerHubSignInUrl } from '../clients/DockerHub/DockerHubRegistryDataProvider';
import { httpRequest } from '../utils/httpRequest';
import { BasicAuthProvider } from './BasicAuthProvider';

export class DockerHubAuthProvider extends BasicAuthProvider implements AuthenticationProvider {
    // TODO: this token expires after a month, should we bother to actually refresh it?
    #token: string | undefined;

    public constructor(storageMemento: vscode.Memento, secretStorage: vscode.SecretStorage) {
        super(storageMemento, secretStorage, 'DockerHub');
    }

    public async getSession(scopes: string[], options?: vscode.AuthenticationGetSessionOptions): Promise<vscode.AuthenticationSession & { type: string }> {
        const creds = await this.getBasicCredentials();

        if (!this.#token || options?.forceNewSession) {
            const requestUrl = DockerHubRequestUrl
                .with({ path: `v2/users/login` });

            const response = await httpRequest<{ token: string }>(requestUrl.toString(), {
                method: 'POST',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: creds.username,
                    password: creds.secret,
                })
            });

            this.#token = (await response.json()).token;
        }

        return {
            id: creds.username,
            type: 'Bearer',
            accessToken: this.#token,
            account: {
                label: creds.username,
                id: creds.username,
            },
            scopes: scopes,
        };
    }

    public async getLoginInformation(): Promise<LoginInformation> {
        const credentials = await this.getBasicCredentials();

        return {
            server: DockerHubSignInUrl,
            username: credentials.username,
            secret: credentials.secret,
        };
    }
}
