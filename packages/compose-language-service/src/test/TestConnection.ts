/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PassThrough } from 'stream';
import { Connection, createConnection, InitializeParams } from 'vscode-languageserver/node';
import { ComposeLanguageService } from '../service/ComposeLanguageService';
import { DefaultInitializeParams } from './DefaultInitializeParams';

export class TestConnection {
    public readonly server: Connection;
    public readonly client: Connection;
    public readonly languageService: ComposeLanguageService;

    public constructor(public readonly initParams: InitializeParams = DefaultInitializeParams) {
        const up = new PassThrough();
        const down = new PassThrough();

        this.server = createConnection(up, down);
        this.client = createConnection(down, up);

        this.languageService = new ComposeLanguageService(this.server, initParams);

        this.server.listen();
        this.client.listen();
    }
}
