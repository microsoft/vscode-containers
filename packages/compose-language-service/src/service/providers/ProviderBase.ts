/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientCapabilities, Connection } from 'vscode-languageserver';
import { ComposeLanguageService } from '../ComposeLanguageService';

export abstract class ProviderBase {
    public constructor(private readonly languageService: ComposeLanguageService) { }

    protected get clientCapabilities(): ClientCapabilities {
        return this.languageService.clientCapabilities;
    }

    protected get connection(): Connection {
        return this.languageService.connection;
    }
}
