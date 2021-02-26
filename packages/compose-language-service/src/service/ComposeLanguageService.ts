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
    Hover,
    HoverParams,
    InitializeParams,
    ResponseError,
    SemanticTokens,
    SemanticTokensBuilder,
    SemanticTokensParams,
    SemanticTokenTypes,
    ServerCapabilities,
    SignatureHelp,
    SignatureHelpParams,
    TextDocumentChangeEvent,
    TextDocuments,
    TextDocumentSyncKind
}
    from 'vscode-languageserver/node';
import { Document, parseDocument } from 'yaml';
import { cstRangeToLspRange } from './utils/cstRangeToLspRange';
import { debounce } from './utils/debounce';

export class ComposeLanguageService implements Disposable {
    private readonly documentManager: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
    private readonly documentCache: { [uri: string]: Document.Parsed } = {};
    private readonly subscriptions: Disposable[] = [];

    public constructor(private readonly connection: Connection, private readonly clientParams: InitializeParams) {
        // Hook up the document listener
        this.documentManager.onDidChangeContent(this.onDidChangeContent, this, this.subscriptions);

        // Hook up all the LSP listeners
        this.connection.onCompletion(async (params, token) => this.onCompletion(params, token));
        this.connection.onHover(async (params, token) => this.onHover(params, token));
        this.connection.onSignatureHelp(async (params, token) => this.onSignatureHelp(params, token));
        this.connection.onDocumentLinks(async (params, token) => this.onDocumentLinks(params, token));
        this.connection.languages.semanticTokens.on(async (params, token) => this.onSemanticTokens(params, token));

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
            completionProvider: {
                triggerCharacters: ['-', ':'],
                resolveProvider: false,
            },
            hoverProvider: true,
            signatureHelpProvider: {
                triggerCharacters: ['-', ':'],
            },
            documentLinkProvider: {
                resolveProvider: false,
            },
            semanticTokensProvider: {
                full: {
                    delta: false,
                },
                legend: {
                    tokenTypes: [
                        SemanticTokenTypes.variable,
                    ],
                    tokenModifiers: [],
                },
            },
            workspace: {
                workspaceFolders: {
                    supported: true,
                },
            },
        };
    }

    public async onDidChangeContent(changed: TextDocumentChangeEvent<TextDocument>): Promise<void | ResponseError<void>> {
        const cst = parseDocument(changed.document.getText(), { prettyErrors: true });

        if (!cst) {
            // TODO: Change this to throwing and internally catch
            return new ResponseError(ErrorCodes.ParseError, 'Malformed YAML document');
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
        return undefined;
    }

    public async onSemanticTokens(params: SemanticTokensParams, token: CancellationToken): Promise<SemanticTokens> {
        const builder = new SemanticTokensBuilder();
        return builder.build();
    }

    public sendDiagnostics(document: TextDocument): void {
        if (!this.clientParams.capabilities.textDocument?.publishDiagnostics) {
            return;
        }

        // I measured the fastest I could type actual words and it was about 50-100 ms between keystrokes (typing code would be slower)
        // So, I think 50 ms is a reasonable debounce delay for sending diagnostics
        debounce(50, { uri: document.uri, callId: 'parse' }, async () => {
            const diagnostics: Diagnostic[] = [];

            for (const error of [...this.documentCache[document.uri].errors, ...this.documentCache[document.uri].warnings]) {
                diagnostics.push(
                    Diagnostic.create(
                        cstRangeToLspRange(document, /* TODO: error.range */[0, 0]),
                        error.message,
                        error.name === 'YAMLWarning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error
                    )
                );
            }

            this.connection.sendDiagnostics({
                uri: document.uri,
                diagnostics: diagnostics,
            });
        });
    }
}
