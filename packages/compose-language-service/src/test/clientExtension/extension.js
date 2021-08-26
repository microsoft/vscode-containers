/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const langClient = require("vscode-languageclient/node");

exports.activate = function activate(context) {
    const serverModule = context.asAbsolutePath('../../../lib/server.js');

    const serverOptions = {
        run: {
            module: serverModule,
            transport: langClient.TransportKind.ipc,
        },
        debug: {
            module: serverModule,
            transport: langClient.TransportKind.ipc,
            options: { execArgv: ['--nolazy', '--inspect=6009'] },
        },
    };

    const clientOptions = {
        documentSelector: [
            {
                language: 'dockercompose'
            },
        ],
    };

    const client = new langClient.LanguageClient('compose-language-server', serverOptions, clientOptions, true);

    context.subscriptions.push(client.start());
}

exports.deactivate = function deactivate() { }
