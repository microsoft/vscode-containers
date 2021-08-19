/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, InitializeParams, ProposedFeatures } from 'vscode-languageserver';
import { createConnection } from 'vscode-languageserver/node';
import { ComposeLanguageService } from './service/ComposeLanguageService';

const connection: Connection = createConnection(ProposedFeatures.all);

// Hook up the connection
connection.onInitialize((params: InitializeParams) => {
    const service = new ComposeLanguageService(connection, params);

    connection.onShutdown(() => {
        service.dispose();
    });

    // Return the InitializeResult
    return {
        capabilities: service.capabilities,
        serverInfo: {
            name: 'Docker Compose Language Server',
        },
    };
});

// Start the connection
connection.listen();
