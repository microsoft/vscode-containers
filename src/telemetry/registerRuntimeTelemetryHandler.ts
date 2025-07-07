/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerTelemetryHandler } from '@microsoft/vscode-azext-utils';
import { DockerClient, DockerComposeClient, PodmanClient, PodmanComposeClient } from '@microsoft/vscode-container-client';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';

export function registerRuntimeTelemetryHandler(ctx: vscode.ExtensionContext): void {
    ctx.subscriptions.push(registerTelemetryHandler(context => {
        const config = vscode.workspace.getConfiguration(configPrefix);
        const containerClientId = config.get<string>('containerClient', '');
        const orchestratorClientId = config.get<string>('orchestratorClient', '');

        switch (containerClientId) {
            case undefined:
            case '':
                context.telemetry.properties.containerClient = 'default';
                break;
            case DockerClient.ClientId:
                context.telemetry.properties.containerClient = DockerClient.prototype.constructor.name;
                break;
            case PodmanClient.ClientId:
                context.telemetry.properties.containerClient = PodmanClient.prototype.constructor.name;
                break;
            default:
                context.telemetry.properties.containerClient = 'unknown';
                break;
        }

        switch (orchestratorClientId) {
            case undefined:
            case '':
                context.telemetry.properties.orchestratorClient = 'default';
                break;
            case DockerComposeClient.ClientId:
                context.telemetry.properties.orchestratorClient = DockerComposeClient.prototype.constructor.name;
                break;
            case PodmanComposeClient.ClientId:
                context.telemetry.properties.orchestratorClient = PodmanComposeClient.prototype.constructor.name;
                break;
            default:
                context.telemetry.properties.orchestratorClient = 'unknown';
                break;
        }
    }));
}
