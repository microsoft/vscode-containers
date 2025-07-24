/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, registerEvent } from '@microsoft/vscode-azext-utils';
import { CommandResponseBase, composeArgs, withArg, withNamedArg } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';
import { ext } from '../extensionVariables';
import { isWindows } from '../utils/osUtils';

export class ExecutionEnvironmentManager implements vscode.Disposable {
    #useWSL: boolean;
    public get useWSL(): boolean {
        return this.#useWSL;
    }
    public set useWSL(value: boolean) {
        this.#useWSL = value;
    }

    #wslDistro: string | null;
    public get wslDistro(): string | null {
        return this.#wslDistro;
    }
    public set wslDistro(value: string | null) {
        this.#wslDistro = value;
    }

    public constructor() {
        this.reconfigure();
    }
    public dispose(): void {
    }

    public reconfigure(): void {
        const config = vscode.workspace.getConfiguration(configPrefix);
        this.#useWSL = config.get<boolean | undefined>('executeInWSL') || false;
        this.#wslDistro = config.get<string | undefined>('executeInWSLDistro') || null;

        ext.outputChannel.debug(`${configPrefix}.executeInWSL: ${this.useWSL}`);
        ext.outputChannel.debug(`${configPrefix}.executeInWSLDistro: ${this.wslDistro}`);
    }

    public registerConfigListener(): void {
        // Register an event to watch for changes to config, reconfigure if needed
        registerEvent('vscode-containers.command.changed', vscode.workspace.onDidChangeConfiguration, (actionContext: IActionContext, e: vscode.ConfigurationChangeEvent) => {
            actionContext.telemetry.suppressAll = true;
            actionContext.errorHandling.suppressDisplay = true;

            if (e.affectsConfiguration(`${configPrefix}.executeInWSL`) || e.affectsConfiguration(`${configPrefix}.executeInWSLDistro`)) {
                this.reconfigure();
            }
        });
    }

    public adjustExecutionArguments(commandResponse: CommandResponseBase, { shouldQuote }: { shouldQuote?: boolean } = {}): CommandResponseBase {
        if (!this.useWSL || !isWindows()) {
            return commandResponse;
        }
        const command = 'wsl.exe';
        const args = composeArgs(
            withNamedArg('-d', this.wslDistro, typeof shouldQuote === "boolean" ? { shouldQuote } : {}),
            withArg('--'),
            withArg(commandResponse.command),
            withArg(...commandResponse.args)
        )();

        return { command, args };

    }
}
