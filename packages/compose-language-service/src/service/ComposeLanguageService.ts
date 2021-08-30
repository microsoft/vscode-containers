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
    TextDocumentIdentifier,
    TextDocuments,
    TextDocumentSyncKind,
}
    from 'vscode-languageserver';
import { ComposeDocument } from './ComposeDocument';
import { ExtendedParams } from './ExtendedParams';
import { MultiCompletionProvider } from './providers/completion/MultiCompletionProvider';
import { DiagnosticProvider } from './providers/DiagnosticProvider';
import { DocumentFormattingProvider } from './providers/DocumentFormattingProvider';
import { ImageLinkProvider } from './providers/ImageLinkProvider';
import { KeyHoverProvider } from './providers/KeyHoverProvider';
import { ProviderBase } from './providers/ProviderBase';
import { MultiSignatureHelpProvider } from './providers/signatureHelp/MultiSignatureHelpProvider';

export class ComposeLanguageService implements Disposable {
    private readonly documentManager: TextDocuments<ComposeDocument> = new TextDocuments(ComposeDocument.DocumentManagerConfig);
    private readonly subscriptions: Disposable[] = [];

    public constructor(public readonly connection: Connection, private readonly clientParams: InitializeParams) {
        // Hook up the document listeners, which create a Disposable which will be added to this.subscriptions
        this.createDocumentManagerHandler(this.documentManager.onDidChangeContent, new DiagnosticProvider().on);

        // Hook up all the LSP listeners, which do not create Disposables for some reason
        this.createLspHandler(this.connection.onCompletion, new MultiCompletionProvider());
        this.createLspHandler(this.connection.onHover, new KeyHoverProvider());
        this.createLspHandler(this.connection.onSignatureHelp, new MultiSignatureHelpProvider());
        this.createLspHandler(this.connection.onDocumentLinks, new ImageLinkProvider());
        this.createLspHandler(this.connection.onDocumentFormatting, new DocumentFormattingProvider());

        // Start the document listener
        this.documentManager.listen(this.connection);
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
                triggerCharacters: ['-', ':'],
                resolveProvider: false,
            },
            hoverProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ['-', ':'],
                retriggerCharacters: ['\n'],
            },
            documentLinkProvider: {
                resolveProvider: false,
            },
            documentFormattingProvider: true,
            // semanticTokensProvider: {
            //     full: {
            //         delta: false,
            //     },
            //     legend: {
            //         tokenTypes: [
            //             SemanticTokenTypes.variable,
            //         ],
            //         tokenModifiers: [],
            //     },
            // },
            workspace: {
                workspaceFolders: {
                    supported: true,
                },
            },
        };
    }

    private createLspHandler<P extends { textDocument: TextDocumentIdentifier }, R, PR, E>(
        event: (handler: ServerRequestHandler<P, R, PR, E>) => void,
        handler: ProviderBase<P & ExtendedParams, R, PR, E>
    ): void {
        event(async (params, token, workDoneProgress, resultProgress) => {
            try {
                const doc = this.documentManager.get(params.textDocument.uri);
                if (!doc) {
                    throw new ResponseError(ErrorCodes.InvalidParams, 'Document not found in cache.');
                }

                const extendedParams = {
                    ...params,
                    document: doc,
                    clientCapabilities: this.clientParams.capabilities,
                    connection: this.connection,
                };

                return await Promise.resolve(handler.on(extendedParams, token, workDoneProgress, resultProgress));
            } catch (error) {
                return ComposeLanguageService.flattenError(error);
            }
        });
    }

    private createDocumentManagerHandler(
        event: Event<TextDocumentChangeEvent<ComposeDocument>>,
        handler: (params: TextDocumentChangeEvent<ComposeDocument> & ExtendedParams) => Promise<void> | void
    ): void {
        event(async (params: TextDocumentChangeEvent<ComposeDocument>) => {
            try {
                const extendedParams = {
                    ...params,
                    document: params.document,
                    clientCapabilities: this.clientParams.capabilities,
                    connection: this.connection,
                };

                return await Promise.resolve(handler(extendedParams));
            } catch (error) {
                return ComposeLanguageService.flattenError(error);
            }
        }, this, this.subscriptions);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static flattenError<E>(error: any): ResponseError<E> {
        if (error instanceof ResponseError) {
            return error;
        } else if (error instanceof Error) {
            return new ResponseError(ErrorCodes.UnknownErrorCode, error.message, error as unknown as E);
        }

        return new ResponseError(ErrorCodes.InternalError, error.toString());
    }
}
