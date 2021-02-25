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
    Disposable,
    DocumentLink,
    DocumentLinkParams,
    Hover,
    HoverParams,
    InitializeParams,
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
import { parseCST, ParsedCST } from 'yaml';

export class ComposeLanguageService implements Disposable {
    private readonly documentManager: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
    private readonly documentCache: { [uri: string]: ParsedCST } = {};
    private readonly subscriptions: Disposable[] = [];

    public constructor(private readonly connection: Connection, private readonly clientParams: InitializeParams) {
        // Hook up the document listener
        this.subscriptions.push(this.documentManager.onDidChangeContent(this.onDidChangeContent, this));

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

    public async onDidChangeContent(changed: TextDocumentChangeEvent<TextDocument>): Promise<void> {
        const cst = parseCST(changed.document.getText());
        cst.setOrigRanges();
        this.documentCache[changed.document.uri] = cst;

        // TODO: send diagnostics?
        console.log('Loaded doc.');
    }

    public async onCompletion(params: CompletionParams, token: CancellationToken): Promise<CompletionItem[]> {
        return [];
    }

    public async onHover(params: HoverParams, token: CancellationToken): Promise<Hover | undefined> {
        return undefined;
    }

    public async onSignatureHelp(params: SignatureHelpParams, token: CancellationToken): Promise<SignatureHelp | undefined> {
        return undefined;
    }

    public async onDocumentLinks(params: DocumentLinkParams, token: CancellationToken): Promise<DocumentLink[]> {
        return [];
    }

    public async onSemanticTokens(params: SemanticTokensParams, token: CancellationToken): Promise<SemanticTokens> {
        const builder = new SemanticTokensBuilder();
        return builder.build();
    }
}
