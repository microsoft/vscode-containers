/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    CancellationToken,
    CompletionItem,
    CompletionParams,
    Connection,
    Diagnostic,
    DiagnosticSeverity,
    Disposable,
    DocumentLink,
    DocumentLinkParams,
    ErrorCodes,
    Event,
    Hover,
    HoverParams,
    InitializeParams,
    ResponseError,
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensParams,
    // SemanticTokenTypes,
    ServerCapabilities,
    ServerRequestHandler,
    SignatureHelp,
    SignatureHelpParams,
    TextDocumentChangeEvent,
    TextDocuments,
    TextDocumentSyncKind
}
    from 'vscode-languageserver/node';
import { Document, parseDocument } from 'yaml';
import { Pair, Scalar, YAMLMap } from 'yaml/dist/ast';
import { cstRangeToLspRange } from './utils/cstRangeToLspRange';
import { debounce } from './utils/debounce';

export class ComposeLanguageService implements Disposable {
    private readonly documentManager: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
    private readonly documentCache: { [uri: string]: Document.Parsed } = {};
    private readonly subscriptions: Disposable[] = [];

    public constructor(private readonly connection: Connection, private readonly clientParams: InitializeParams) {
        // Hook up the document listener, which creates a Disposable which will be added to this.subscriptions
        this.createDocumentManagerHandler(this.documentManager.onDidChangeContent, this.onDidChangeContent);

        // Hook up all the LSP listeners, which do not create Disposables
        this.createLspHandler(this.connection.onCompletion, this.onCompletion);
        this.createLspHandler(this.connection.onHover, this.onHover);
        this.createLspHandler(this.connection.onSignatureHelp, this.onSignatureHelp);
        this.createLspHandler(this.connection.onDocumentLinks, this.onDocumentLinks);
        this.createLspHandler(this.connection.languages.semanticTokens.on, this.onSemanticTokens);

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
        const cst = parseDocument(changed.document.getText(), { prettyErrors: true });

        if (!cst) {
            throw new ResponseError(ErrorCodes.ParseError, 'Malformed YAML document');
        }

        this.documentCache[changed.document.uri] = cst;

        this.sendDiagnostics(changed.document);
    }

    public async onCompletion(params: CompletionParams, token: CancellationToken): Promise<CompletionItem[] | undefined> {
        return undefined;
    }

    public async onHover(params: HoverParams, token: CancellationToken): Promise<Hover | undefined> {
        return undefined;
    }

    public async onSignatureHelp(params: SignatureHelpParams, token: CancellationToken): Promise<SignatureHelp | undefined> {
        return undefined;
    }

    public async onDocumentLinks(params: DocumentLinkParams, token: CancellationToken): Promise<DocumentLink[] | undefined> {
        const doc = this.documentCache[params.textDocument.uri];
        const textDoc = this.documentManager.get(params.textDocument.uri);
        if (!doc || !textDoc) {
            throw new ResponseError(ErrorCodes.ParseError, 'Document not found in cache.');
        }

        const results: DocumentLink[] = [];
        const services = (doc.contents as YAMLMap)?.get('services')?.items?.map((pair: Pair) => pair?.value) as YAMLMap[] ?? [];

        for (const service of services) {
            const image = service?.get('image', true) as Scalar | undefined;

            if (typeof image?.value === 'string') {
                results.push(DocumentLink.create(cstRangeToLspRange(textDoc, image.range), 'https://microsoft.com'));
            }
        }

        return results;
    }

    public async onSemanticTokens(params: SemanticTokensParams, token: CancellationToken): Promise<SemanticTokens> {
        const builder = new SemanticTokensBuilder();
        return builder.build();
    }

    public sendDiagnostics(document: TextDocument): void {
        if (!this.clientParams.capabilities.textDocument?.publishDiagnostics) {
            return;
        }

        // Diagnostics will be sent half a second after the changes stop
        debounce(500, { uri: document.uri, callId: 'parse' }, async () => {
            const diagnostics: Diagnostic[] = [];

            for (const error of [...this.documentCache[document.uri].errors, ...this.documentCache[document.uri].warnings]) {
                diagnostics.push(
                    Diagnostic.create(
                        cstRangeToLspRange(document, [error.offset, error.offset]), // TODO: range?
                        error.message,
                        error.name === 'YAMLWarning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error
                    )
                );
            }

            this.connection.sendDiagnostics({
                uri: document.uri,
                diagnostics: diagnostics,
            });
        }, this);
    }

    private createLspHandler<P, R, PR, E>(event: (handler: ServerRequestHandler<P, R, PR, E>) => void, handler: ServerRequestHandler<P, R, PR, E>): void {
        const boundHandler = handler.bind(this);

        event(async (params, token, workDoneProgress, resultProgress) => {
            try {
                return await boundHandler(params, token, workDoneProgress, resultProgress);
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

    private createDocumentManagerHandler(event: Event<TextDocumentChangeEvent<TextDocument>>, handler: (params: TextDocumentChangeEvent<TextDocument>) => Promise<void>): void {
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
