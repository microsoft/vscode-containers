/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');
const { DocumentSettingsClientFeature } = require('./DocumentSettingsClientFeature');
const { AlternateYamlLanguageServiceClientFeature } = require('./AlternateYamlLanguageServiceClientFeature');

async function activate(context) {
    const serverModule = context.asAbsolutePath('../../../dist/cjs/server.js');

    const serverOptions = {
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

    const clientOptions = {
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

function deactivate() {
    // Do nothing
}

module.exports = {
    activate,
    deactivate,
};
