/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientIdentity } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';
import { TimeoutPromiseSource } from '../utils/promiseUtils';

export abstract class RuntimeManager<TClient extends ClientIdentity> extends vscode.Disposable {
    private readonly _runtimeClients = new Map<string, TClient>();
    protected readonly runtimeClientRegisteredEmitter = new vscode.EventEmitter<TClient>();

    protected constructor(private readonly clientSettingName: string) {
        super(() => { /* Do nothing */ });
    }

    public registerRuntimeClient(client: TClient): vscode.Disposable {
        if (!client || !client.id) {
            throw new Error('Invalid client supplied.');
        }

        if (this._runtimeClients.has(client.id)) {
            throw new Error(`A container runtime client with ID '${client.id}' is already registered.`);
        }

        this._runtimeClients.set(client.id, client);

        this.runtimeClientRegisteredEmitter.fire(client);

        return new vscode.Disposable(() => {
            this._runtimeClients.delete(client.id);
        });
    }

    public get runtimeClients(): Array<TClient> {
        return Array.from(this._runtimeClients.values());
    }

    public async getClient(): Promise<TClient> {
        const config = vscode.workspace.getConfiguration(configPrefix);
        const runtimeClientId = config.get<string | undefined>(this.clientSettingName);

        let runtimeClient: TClient;

        if (!runtimeClientId) {
            runtimeClient = this.getDefaultClient();
        } else {
            runtimeClient = await this.waitForClientToBeRegistered(runtimeClientId);
        }

        if (!runtimeClient) {
            throw new Error(vscode.l10n.t('No container / orchestrator client with ID \'{0}\' is registered.', runtimeClientId));
        }

        return runtimeClient;
    }

    public async getCommand(): Promise<string> {
        return (await this.getClient()).commandName;
    }

    protected abstract getDefaultClient(): TClient;

    protected waitForClientToBeRegistered(clientId: string): Promise<TClient> {
        if (this._runtimeClients.has(clientId)) {
            // If it's already registered, resolve immediately
            return Promise.resolve(this._runtimeClients.get(clientId));
        }

        const registeredClientPromise = new Promise<TClient>((resolve) => {
            if (this._runtimeClients.has(clientId)) {
                // Check again if it's already registered, in case it was registered between the check above and the registration of the event handler
                resolve(this._runtimeClients.get(clientId));
            } else {
                // Otherwise, wait for it to be registered
                const disposable = this.runtimeClientRegisteredEmitter.event(client => {
                    if (client.id === clientId) {
                        disposable.dispose();
                        resolve(client);
                    }
                });
            }
        });

        const tps = new TimeoutPromiseSource(1000);

        return Promise.race([registeredClientPromise, tps.promise]);
    }
}
