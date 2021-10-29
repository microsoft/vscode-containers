/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
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
import { DocumentSettingsNotificationParams, DocumentSettingsNotification } from '../client/DocumentSettings';
import { initEvent } from '../client/TelemetryEvent';
import { ComposeDocument } from './ComposeDocument';
import { ExtendedParams, TextDocumentParams } from './ExtendedParams';
import { MultiCompletionProvider } from './providers/completion/MultiCompletionProvider';
import { DiagnosticProvider } from './providers/DiagnosticProvider';
import { DocumentFormattingProvider } from './providers/DocumentFormattingProvider';
import { ImageLinkProvider } from './providers/ImageLinkProvider';
import { KeyHoverProvider } from './providers/KeyHoverProvider';
import { ProviderBase } from './providers/ProviderBase';
import { ActionContext, runWithContext } from './utils/ActionContext';
import { TelemetryAggregator } from './utils/telemetry/TelemetryAggregator';

export class ComposeLanguageService implements Disposable {
    private readonly documentManager: TextDocuments<ComposeDocument> = new TextDocuments(ComposeDocument.DocumentManagerConfig);
    private readonly subscriptions: Disposable[] = [];
    private readonly telemetryAggregator: TelemetryAggregator;

    public constructor(public readonly connection: Connection, private readonly clientParams: InitializeParams) {
        // Hook up the document listeners, which create a Disposable which will be added to this.subscriptions
        this.createDocumentManagerHandler(this.documentManager.onDidChangeContent, new DiagnosticProvider().on);

        // Hook up all the LSP listeners, which do not create Disposables for some reason
        this.createLspHandler(this.connection.onCompletion, new MultiCompletionProvider());
        this.createLspHandler(this.connection.onHover, new KeyHoverProvider());
        this.createLspHandler(this.connection.onDocumentLinks, new ImageLinkProvider());
        this.createLspHandler(this.connection.onDocumentFormatting, new DocumentFormattingProvider());

        // Hook up one additional notification handler
        this.connection.onNotification(DocumentSettingsNotification.method, (params) => this.onDidChangeDocumentSettings(params));

        // Start the document listener
        this.documentManager.listen(this.connection);

        // Start the telemetry aggregator
        this.subscriptions.push(this.telemetryAggregator = new TelemetryAggregator(this.connection, clientParams.initializationOptions?.telemetryAggregationInterval));
    }

    public dispose(): void {
        for (const subscription of this.subscriptions) {
            subscription.dispose();
        }
    }

    public get capabilities(): ServerCapabilities {
        return {
            textDocumentSync: {
                openClose: true,
                change: TextDocumentSyncKind.Incremental,
                willSave: false,
                willSaveWaitUntil: false,
                save: false,
            },
            completionProvider: {
                triggerCharacters: ['-', ':', ' ', '"'],
                resolveProvider: false,
            },
            hoverProvider: true,
            documentLinkProvider: {
                resolveProvider: false,
            },
            documentFormattingProvider: true,
            workspace: {
                workspaceFolders: {
                    supported: true,
                },
            },
        };
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

    private createDocumentManagerHandler(
        event: Event<TextDocumentChangeEvent<ComposeDocument>>,
        handler: (params: TextDocumentChangeEvent<ComposeDocument> & ExtendedParams) => Promise<void> | void
    ): void {
        event(async (params: TextDocumentChangeEvent<ComposeDocument>) => {

            return await this.callWithTelemetryAndErrorHandling(handler.name, async () => {
                const extendedParams: TextDocumentChangeEvent<ComposeDocument> & ExtendedParams = {
                    ...params,
                    textDocument: params.document.id,
                };

                return await Promise.resolve(handler(extendedParams));
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
                responseError = error;
                stack = error.stack;
            } else if (error instanceof Error) {
                responseError = new ResponseError(ErrorCodes.UnknownErrorCode, error.message, error as unknown as E);
                stack = error.stack;
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                responseError = new ResponseError(ErrorCodes.InternalError, (error as any).toString ? (error as any).toString() : 'Unknown error');
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
