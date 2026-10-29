/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerTelemetryHandler } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';
import { getContainerClientTelemetryName, getOrchestratorClientTelemetryName } from '../runtimes/officialRuntimeRegistrations';

export function registerRuntimeTelemetryHandler(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(registerTelemetryHandler(context => {
        const config = vscode.workspace.getConfiguration(configPrefix);

        context.telemetry.properties.containerClient = new vscode.TelemetryTrustedValue(getContainerClientTelemetryName(config.get<string>('containerClient', '')));
        context.telemetry.properties.orchestratorClient = new vscode.TelemetryTrustedValue(getOrchestratorClientTelemetryName(config.get<string>('orchestratorClient', '')));
    }));
}
