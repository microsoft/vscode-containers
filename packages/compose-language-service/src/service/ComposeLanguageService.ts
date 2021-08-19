/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    // CancellationToken,
    // CompletionItem,
    // CompletionParams,
    Connection,
    Diagnostic,
    DiagnosticSeverity,
    Disposable,
    ErrorCodes,
    Event,
    // Hover,
    // HoverParams,
    InitializeParams,
    ResponseError,
    // SemanticTokens,
    // SemanticTokensBuilder,
    // SemanticTokensParams,
    // SemanticTokenTypes,
    ServerCapabilities,
    ServerRequestHandler,
    // SignatureHelp,
    // SignatureHelpParams,
    TextDocumentChangeEvent,
    TextDocumentIdentifier,
    TextDocuments,
    TextDocumentSyncKind
}
    from 'vscode-languageserver';
import { Composer, isDocument, Parser } from 'yaml';
import { yamlRangeToLspRange } from './utils/yamlRangeToLspRange';
import { debounce } from './utils/debounce';
import { ImageLinkProvider } from './ImageLinkProvider';
import { CachedDocument } from './CachedDocument';

export class ComposeLanguageService implements Disposable {
    private readonly documentManager: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
    private readonly documentCache: { [uri: string]: CachedDocument } = {};
    private readonly subscriptions: Disposable[] = [];

    public constructor(private readonly connection: Connection, private readonly clientParams: InitializeParams) {
        // Hook up the document listener, which creates a Disposable which will be added to this.subscriptions
        this.createDocumentManagerHandler(this.documentManager.onDidChangeContent, this.onDidChangeContent);


        // Hook up all the LSP listeners, which do not create Disposables
        // this.createLspHandler(this.connection.onCompletion, this.onCompletion);
        // this.createLspHandler(this.connection.onHover, this.onHover);
        // this.createLspHandler(this.connection.onSignatureHelp, this.onSignatureHelp);
        this.createLspHandler(this.connection.onDocumentLinks, ImageLinkProvider.onDocumentLinks);
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
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // completionProvider: {
            //     triggerCharacters: ['-', ':'],
            //     resolveProvider: false,
            // },
            // hoverProvider: true,
            // signatureHelpProvider: {
            //     triggerCharacters: ['-', ':'],
            // },
            documentLinkProvider: {
                resolveProvider: false,
            },
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

    public async onDidChangeContent(changed: TextDocumentChangeEvent<TextDocument>): Promise<void> {
        const tokens = new Parser().parse(changed.document.getText());
        const [cstDocument] = tokens;
        const composedTokens = new Composer().compose([cstDocument]);
        const [parsedDocument] = composedTokens;

        if (cstDocument.type !== 'document') {
            throw new ResponseError(ErrorCodes.ParseError, 'Malformed YAML document');
        }

        if (!isDocument(parsedDocument)) {
            throw new ResponseError(ErrorCodes.ParseError, 'Malformed YAML document');
        }

        this.documentCache[changed.document.uri] = {
            textDocument: changed.document,
            cst: cstDocument,
            yamlDocument: parsedDocument,
        };

        this.sendDiagnostics(this.documentCache[changed.document.uri]);
    }

    /*
    public async onCompletion(params: CompletionParams, token: CancellationToken): Promise<CompletionItem[] | undefined> {
        return undefined;
    }

    public async onHover(params: HoverParams, token: CancellationToken): Promise<Hover | undefined> {
        return undefined;
    }

    public async onSignatureHelp(params: SignatureHelpParams, token: CancellationToken): Promise<SignatureHelp | undefined> {
        return undefined;
    }

    public async onSemanticTokens(params: SemanticTokensParams, token: CancellationToken): Promise<SemanticTokens> {
        const builder = new SemanticTokensBuilder();
        return builder.build();
    }
    */

    public sendDiagnostics(cachedDocument: CachedDocument): void {
        if (!this.clientParams.capabilities.textDocument?.publishDiagnostics) {
            return;
        }

        // Diagnostics will be sent half a second after the changes stop
        debounce(500, { uri: cachedDocument.textDocument.uri, callId: 'diagnostics' }, async () => {
            const diagnostics: Diagnostic[] = [];

            for (const error of [...cachedDocument.yamlDocument.errors, ...cachedDocument.yamlDocument.warnings]) {
                diagnostics.push(
                    Diagnostic.create(
                        yamlRangeToLspRange(cachedDocument.textDocument, error.pos),
                        error.message,
                        error.name === 'YAMLWarning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
                        error.code
                    )
                );
            }

            this.connection.sendDiagnostics({
                uri: cachedDocument.textDocument.uri,
                diagnostics: diagnostics,
            });
        }, this);
    }

    private createLspHandler<P extends { textDocument: TextDocumentIdentifier }, R, PR, E>(
        event: (handler: ServerRequestHandler<P, R, PR, E>) => void,
        handler: ServerRequestHandler<P & { cachedDocument: CachedDocument }, R, PR, E>
    ): void {
        event(async (params, token, workDoneProgress, resultProgress) => {
            try {
                const cachedDocument = this.documentCache[params.textDocument.uri];
                const textDocument = this.documentManager.get(params.textDocument.uri);
                if (!cachedDocument || !textDocument) {
                    throw new ResponseError(ErrorCodes.ParseError, 'Document not found in cache.');
                }

                return await handler.call(this, { ...params, cachedDocument, textDocument }, token, workDoneProgress, resultProgress);
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
        event: Event<TextDocumentChangeEvent<TextDocument>>,
        handler: (params: TextDocumentChangeEvent<TextDocument>) => Promise<void>
    ): void {
        event(async (params: TextDocumentChangeEvent<TextDocument>) => {
            try {
                return await handler.call(this, params);
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
