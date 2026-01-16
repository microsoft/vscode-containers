/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, IActionContext } from '@microsoft/vscode-azext-utils';
import { ClientIdentity } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';
import { TimeoutPromiseSource } from '../utils/promiseUtils';

export abstract class RuntimeManager<TClient extends ClientIdentity> implements vscode.Disposable {
    private readonly _runtimeClients = new Map<string, TClient>();
    private readonly runtimeClientRegisteredEmitter = new vscode.EventEmitter<TClient>();

    private readonly onDidChangeConfigurationDisposable: vscode.Disposable;

    protected constructor(private readonly defaultClientId: string, private readonly clientSettingName: string, protected readonly overrideCommandSettingName: string) {
        this.onDidChangeConfigurationDisposable = vscode.workspace.onDidChangeConfiguration(async e => {
            if (e.affectsConfiguration(`${configPrefix}.${this.overrideCommandSettingName}`)) {
                return callWithTelemetryAndErrorHandling('vscode-containers.command.changed', (context: IActionContext) => {
                    for (const client of this._runtimeClients.values()) {
                        this.reconfigureClient(client);
                    }
                });
            }
        });
    }

    public dispose(): void {
        this.runtimeClientRegisteredEmitter.dispose();
        this.onDidChangeConfigurationDisposable.dispose();
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

        this.reconfigureClient(client);

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
            runtimeClient = this._runtimeClients.get(this.defaultClientId);
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

    protected reconfigureClient(client: TClient): void {
        client.commandName = this.getOverrideSettingValue() || client.defaultCommandName;
    }

    protected getOverrideSettingValue(): string | undefined {
        return vscode.workspace.getConfiguration(configPrefix).get<string | undefined>(this.overrideCommandSettingName);
    }

    private waitForClientToBeRegistered(clientId: string): Promise<TClient> {
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
