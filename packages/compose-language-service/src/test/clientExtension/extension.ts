/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { DocumentSettingsClientFeature } from './DocumentSettingsClientFeature';
import { AlternateYamlLanguageServiceClientFeature } from './AlternateYamlLanguageServiceClientFeature';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const serverModule = context.asAbsolutePath('../../../lib/server.js');

    const serverOptions: ServerOptions = {
        run: {
            module: serverModule,
            transport: TransportKind.ipc,
        },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] },
        },
    };

    const serverOutputChannel = vscode.window.createOutputChannel('Compose Language Service');
    const clientOutputChannel = vscode.window.createOutputChannel('Compose Client Extension');

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            {
                language: 'dockercompose'
            },
        ],
        outputChannel: serverOutputChannel,
        initializationOptions: {
            telemetryAggregationInterval: 20 * 1000, // Used to speed up the telemetry aggregation cycle
        },
    };

    const client = new LanguageClient('compose-language-server', serverOptions, clientOptions, true);
    client.registerFeature(new DocumentSettingsClientFeature(client));
    client.registerFeature(new AlternateYamlLanguageServiceClientFeature());

    context.subscriptions.push(client.onTelemetry((e) => {
        clientOutputChannel.appendLine(JSON.stringify(e));
    }));

    context.subscriptions.push(client);
    await client.start();
}

export function deactivate(): void {
    // Do nothing
}
