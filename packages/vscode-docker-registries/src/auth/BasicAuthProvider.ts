/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthenticationProvider } from '../contracts/AuthenticationProvider';
import { BasicCredentials, LoginInformation } from '../contracts/BasicCredentials';

export abstract class BasicAuthProvider implements AuthenticationProvider {
    public constructor(private readonly storageMemento: vscode.Memento, private readonly secretStorage: vscode.SecretStorage, private readonly storageSubKey: string) { }

    public async getBasicCredentials(): Promise<BasicCredentials> {
        const username = this.storageMemento.get<string>(`BasicAuthProvider.${this.storageSubKey}.username`);
        const secret = await this.secretStorage.get(`BasicAuthProvider.${this.storageSubKey}.secret`);

        if (username === undefined || username === null) {
            // An empty username is allowed
            throw new Error(vscode.l10n.t('Could not load username for {0}', this.storageSubKey));
        } else if (secret === undefined || secret === null) {
            // An empty string is allowed as a secret (but obviously not advisable)
            throw new Error(vscode.l10n.t('Could not load secret for {0}', this.storageSubKey));
        }

        return {
            username,
            secret,
        };
    }

    public async removeSession(): Promise<void> {
        await this.secretStorage.delete(`BasicAuthProvider.${this.storageSubKey}.secret`);
        await this.storageMemento.update(`BasicAuthProvider.${this.storageSubKey}.username`, undefined);
    }

    public async storeBasicCredentials(credential: BasicCredentials): Promise<void> {
        await this.storageMemento.update(`BasicAuthProvider.${this.storageSubKey}.username`, credential.username);
        await this.secretStorage.store(`BasicAuthProvider.${this.storageSubKey}.secret`, credential.secret);
    }

    public abstract getSession(scopes: string[], options?: vscode.AuthenticationGetSessionOptions | undefined): Promise<vscode.AuthenticationSession & { type: string; }>;
    public abstract getLoginInformation?(): Promise<LoginInformation>;
}
