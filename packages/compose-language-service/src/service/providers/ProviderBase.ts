/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, ClientCapabilities, Connection, HandlerResult, ResultProgressReporter, WorkDoneProgressReporter } from 'vscode-languageserver';
import { ComposeLanguageService } from '../ComposeLanguageService';

export abstract class ProviderBase<P, R, PR, E> {
    public constructor(private readonly languageService: ComposeLanguageService) { }

    protected get clientCapabilities(): ClientCapabilities {
        return this.languageService.clientCapabilities;
    }

    protected get connection(): Connection {
        return this.languageService.connection;
    }

    public abstract on(params: P, token: CancellationToken, workDoneProgress: WorkDoneProgressReporter, resultProgress?: ResultProgressReporter<PR>): HandlerResult<R, E>;
}
