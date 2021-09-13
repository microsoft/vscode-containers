/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { DocumentSettingsClientFeature } from './DocumentSettingsClientFeature';

export function activate(context: vscode.ExtensionContext): void {
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

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            {
                language: 'dockercompose'
            },
        ],
    };

    const client = new LanguageClient('compose-language-server', serverOptions, clientOptions, true);
    client.registerFeature(new DocumentSettingsClientFeature(client));

    context.subscriptions.push(client.start());
}

export function deactivate(): void {
    // Do nothing
}
