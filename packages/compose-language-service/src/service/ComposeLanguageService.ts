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
import { DiagnosticProvider } from './providers/DiagnosticProvider';
import { DocumentFormattingProvider } from './providers/DocumentFormattingProvider';
import { ImageLinkProvider } from './providers/ImageLinkProvider';
import { KeyHoverProvider } from './providers/KeyHoverProvider';

export class ComposeLanguageService implements Disposable {
    private readonly documentManager: TextDocuments<ComposeDocument> = new TextDocuments(ComposeDocument.DocumentManagerConfig);
    private readonly subscriptions: Disposable[] = [];

    public constructor(private readonly connection: Connection, private readonly clientParams: InitializeParams) {
        // Hook up the document listeners, which create a Disposable which will be added to this.subscriptions
        if (this.clientParams.capabilities.textDocument?.publishDiagnostics) {
            this.createDocumentManagerHandler(this.documentManager.onDidChangeContent, DiagnosticProvider.onDidChangeContent);
        }

        // Hook up all the LSP listeners, which do not create Disposables
        // These all await a request from the client so we don't need to check for client capabilities
        // this.createLspHandler(this.connection.onCompletion, this.onCompletion);
        this.createLspHandler(this.connection.onHover, KeyHoverProvider.onHover);
        // this.createLspHandler(this.connection.onSignatureHelp, this.onSignatureHelp);
        this.createLspHandler(this.connection.onDocumentLinks, ImageLinkProvider.onDocumentLinks);
        this.createLspHandler(this.connection.onDocumentFormatting, DocumentFormattingProvider.onDocumentFormatting);
        // this.createLspHandler(this.connection.languages.semanticTokens.on, this.onSemanticTokens);

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
                openClose: false,
                change: TextDocumentSyncKind.Incremental,
                willSave: false,
                willSaveWaitUntil: false,
                save: false,
            },
            // completionProvider: {
            //     triggerCharacters: ['-', ':'],
            //     resolveProvider: false,
            // },
            hoverProvider: true,
            // signatureHelpProvider: {
            //     triggerCharacters: ['-', ':'],
            // },
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
        handler: ServerRequestHandler<P & { doc: ComposeDocument }, R, PR, E>
    ): void {
        event(async (params, token, workDoneProgress, resultProgress) => {
            try {
                const doc = this.documentManager.get(params.textDocument.uri);
                if (!doc) {
                    throw new ResponseError(ErrorCodes.ParseError, 'Document not found in cache.');
                }

                return await handler.call(this, { ...params, doc }, token, workDoneProgress, resultProgress);
            } catch (error) {
                if (error instanceof ResponseError) {
                    return error;
                } else if (error instanceof Error) {
                    return new ResponseError(ErrorCodes.UnknownErrorCode, error.message, error);
                }

                return new ResponseError(ErrorCodes.InternalError, error.toString());
            }
        });
    }

    private createDocumentManagerHandler(
        event: Event<TextDocumentChangeEvent<ComposeDocument>>,
        handler: (params: TextDocumentChangeEvent<ComposeDocument> & { connection: Connection }) => Promise<void>
    ): void {
        event(async (params: TextDocumentChangeEvent<ComposeDocument>) => {
            try {
                return await handler.call(this, { ...params, connection: this.connection });
            } catch (error) {
                if (error instanceof ResponseError) {
                    return error;
                } else if (error instanceof Error) {
                    return new ResponseError(ErrorCodes.UnknownErrorCode, error.message, error);
                }

                return new ResponseError(ErrorCodes.InternalError, error.toString());
            }
        }, this, this.subscriptions);
    }
}
