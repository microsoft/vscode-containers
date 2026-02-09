/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as util from 'util';
import {
    CancellationToken,
    Connection,
    Disposable,
    ErrorCodes,
    Event,
    InitializeParams,
    ResponseError,
    ServerCapabilities,
    ServerRequestHandler,
    TextDocumentChangeEvent,
    TextDocuments,
    TextDocumentSyncKind,
}
    from 'vscode-languageserver';
import type { AlternateYamlLanguageServiceClientCapabilities } from '../common/AlternateYamlLanguageServiceClientCapabilities';
import type { ComposeLanguageClientCapabilities } from '../common/ComposeLanguageClientCapabilities';
import { type DocumentSettingsNotificationParams, DocumentSettingsNotification } from '../common/DocumentSettingsClientCapabilities';
import { initEvent } from '../common/TelemetryEvent';
import type { TextDocumentParams } from '../common/TextDocumentParams';
import { ComposeDocument } from './ComposeDocument';
import type { ExtendedParams } from './ExtendedParams';
import { MultiCompletionProvider } from './providers/completion/MultiCompletionProvider';
import { DiagnosticProvider } from './providers/DiagnosticProvider';
import { DocumentFormattingProvider } from './providers/DocumentFormattingProvider';
import { ImageLinkProvider } from './providers/ImageLinkProvider';
import { KeyHoverProvider } from './providers/KeyHoverProvider';
import { ProviderBase } from './providers/ProviderBase';
import { ServiceStartupCodeLensProvider } from './providers/ServiceStartupCodeLensProvider';
import { ActionContext, runWithContext } from './utils/ActionContext';
import { TelemetryAggregator } from './utils/telemetry/TelemetryAggregator';

const DefaultCapabilities: ServerCapabilities = {
    // Text document synchronization
    textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Incremental,
        willSave: false,
        willSaveWaitUntil: false,
        save: false,
    },

    // Both basic and advanced completions
    completionProvider: {
        triggerCharacters: ['-', ':', ' ', '"'],
        resolveProvider: false,
    },

    // Code lenses for starting services
    codeLensProvider: {
        resolveProvider: false,
    },

    // Hover over YAML keys
    hoverProvider: true,

    // Links to Docker Hub on image names
    documentLinkProvider: {
        resolveProvider: false,
    },

    // YAML formatting
    documentFormattingProvider: true,

    // Workspace features
    workspace: {
        workspaceFolders: {
            supported: true,
        },
    },
};

// Default settings for a client with no alternate YAML language service
const DefaultAlternateYamlLanguageServiceClientCapabilities: AlternateYamlLanguageServiceClientCapabilities = {
    syntaxValidation: false,
    schemaValidation: false,

    basicCompletions: false,
    advancedCompletions: false,
    serviceStartupCodeLens: false,
    hover: false,
    imageLinks: false,
    formatting: false,
};

export class ComposeLanguageService implements Disposable {
    private readonly documentManager = new TextDocuments<ComposeDocument>(ComposeDocument.DocumentManagerConfig);
    private readonly subscriptions: Disposable[] = [];
    private readonly telemetryAggregator: TelemetryAggregator;
    private readonly _capabilities: ServerCapabilities = DefaultCapabilities;

    public constructor(public readonly connection: Connection, private readonly clientParams: InitializeParams) {
        let altYamlCapabilities = (clientParams.capabilities as ComposeLanguageClientCapabilities).experimental?.alternateYamlLanguageService;

        if (altYamlCapabilities) {
            connection.console.info('An alternate YAML language service is present. The Compose language service will not enable features already provided by the alternate.');
        } else {
            altYamlCapabilities = DefaultAlternateYamlLanguageServiceClientCapabilities;
        }

        // Hook up the document listeners, which create a Disposable which will be added to this.subscriptions

        if (altYamlCapabilities.syntaxValidation && altYamlCapabilities.schemaValidation) {
            // Noop. No server-side capability needs to be set for diagnostics because it is based on pushing from server to client.
        } else {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
            this.createDocumentManagerHandler(this.documentManager.onDidChangeContent, new DiagnosticProvider(clientParams.initializationOptions?.diagnosticDelay, !altYamlCapabilities.syntaxValidation, !altYamlCapabilities.schemaValidation));
        }

        // End of document listeners

        // Hook up all the applicable LSP listeners, which do not create Disposables for some reason

        if (altYamlCapabilities.basicCompletions && altYamlCapabilities.advancedCompletions) {
            this._capabilities.completionProvider = undefined;
        } else {
            this.createLspHandler(this.connection.onCompletion.bind(this), new MultiCompletionProvider(!altYamlCapabilities.basicCompletions, !altYamlCapabilities.advancedCompletions));
        }

        if (altYamlCapabilities.serviceStartupCodeLens) {
            this._capabilities.codeLensProvider = undefined;
        } else {
            this.createLspHandler(this.connection.onCodeLens.bind(this), new ServiceStartupCodeLensProvider());
        }

        if (altYamlCapabilities.hover) {
            this._capabilities.hoverProvider = undefined;
        } else {
            this.createLspHandler(this.connection.onHover.bind(this), new KeyHoverProvider());
        }

        if (altYamlCapabilities.imageLinks) {
            this._capabilities.documentLinkProvider = undefined;
        } else {
            this.createLspHandler(this.connection.onDocumentLinks.bind(this), new ImageLinkProvider());
        }

        if (altYamlCapabilities.formatting) {
            this._capabilities.documentFormattingProvider = undefined;
        } else {
            this.createLspHandler(this.connection.onDocumentFormatting.bind(this), new DocumentFormattingProvider());
        }

        // End of LSP listeners

        // Hook up one additional notification handler
        this.connection.onNotification(DocumentSettingsNotification.type, (params: DocumentSettingsNotificationParams) => this.onDidChangeDocumentSettings(params));

        // Start the document listener
        this.documentManager.listen(this.connection);

        // Start the telemetry aggregator
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
        this.subscriptions.push(this.telemetryAggregator = new TelemetryAggregator(this.connection, clientParams.initializationOptions?.telemetryAggregationInterval));
    }

    public dispose(): void {
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
    }

    public get capabilities(): ServerCapabilities {
        return this._capabilities;
    }

    private onDidChangeDocumentSettings(params: DocumentSettingsNotificationParams): void {
        // TODO: Telemetrize this?
        const composeDoc = this.documentManager.get(params.textDocument.uri);

        if (composeDoc) {
            composeDoc.updateSettings(params);
        }
    }

    private createLspHandler<P extends TextDocumentParams, R, PR, E>(
        event: (handler: ServerRequestHandler<P, R, PR, E>) => void,
        handler: ProviderBase<P & ExtendedParams, R, PR, E>
    ): void {
        event(async (params, token, workDoneProgress, resultProgress) => {

            return await this.callWithTelemetryAndErrorHandling(handler.constructor.name, async () => {
                const doc = this.documentManager.get(params.textDocument.uri);
                if (!doc) {
                    throw new ResponseError(ErrorCodes.InvalidParams, 'Document not found in cache.');
                }

                const extendedParams: P & ExtendedParams = {
                    ...params,
                    document: doc,
                };

                return await Promise.resolve(handler.on(extendedParams, token, workDoneProgress, resultProgress));
            });

        });
    }

    private createDocumentManagerHandler<P extends TextDocumentChangeEvent<ComposeDocument>>(
        event: Event<P>,
        handler: ProviderBase<P & ExtendedParams, void, never, never>
    ): void {
        event(async (params) => {

            return await this.callWithTelemetryAndErrorHandling(handler.constructor.name, async () => {
                const extendedParams: P & ExtendedParams = {
                    ...params,
                    textDocument: params.document.id,
                };

                return await Promise.resolve(handler.on(extendedParams, CancellationToken.None));
            });

        }, this, this.subscriptions);
    }

    private async callWithTelemetryAndErrorHandling<R, E>(callbackId: string, callback: () => Promise<R>): Promise<R | ResponseError<E>> {
        const actionContext: ActionContext = {
            clientCapabilities: this.clientParams.capabilities,
            connection: this.connection,
            telemetry: initEvent(callbackId),
        };

        const startTime = process.hrtime.bigint();

        try {
            return await runWithContext(actionContext, callback);
        } catch (error) {
            let responseError: ResponseError<E>;
            let stack: string | undefined;

            if (error instanceof ResponseError) {
                responseError = error as ResponseError<E>;
                stack = error.stack;
            } else if (error instanceof Error) {
                responseError = new ResponseError(ErrorCodes.UnknownErrorCode, error.message, error as E);
                stack = error.stack;
            } else {
                responseError = new ResponseError(ErrorCodes.InternalError, util.inspect(error) || 'Unknown error');
            }

            actionContext.telemetry.properties.result = 'Failed';
            actionContext.telemetry.properties.error = responseError.code.toString();
            actionContext.telemetry.properties.errorMessage = responseError.message;
            actionContext.telemetry.properties.stack = stack;

            return responseError;
        } finally {
            const endTime = process.hrtime.bigint();
            const elapsedMicroseconds = Number((endTime - startTime) / BigInt(1000));
            actionContext.telemetry.measurements.duration = elapsedMicroseconds;

            // The aggregator will internally handle suppressing / etc.
            this.telemetryAggregator.logEvent(actionContext.telemetry);
        }
    }
}
