/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ErrorCodes, Position, Range, ResponseError, TextDocumentsConfiguration } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CST, Document as YamlDocument, Parser, Composer, isDocument } from 'yaml';
import { Lazy } from './utils/Lazy';

export class ComposeDocument {
    public readonly fullCst = new Lazy(() => this.buildFullCst());
    public readonly documentCst = new Lazy(() => this.buildDocumentCst());
    public readonly yamlDocument = new Lazy(() => this.buildYamlDocument());

    private constructor(
        public readonly textDocument: TextDocument,
    ) { }

    public lineAt(line: Position | number): string | undefined {
        // Flatten to a position at the start of the line
        const start = (typeof line === 'number') ? Position.create(line, 0) : Position.create(line.line, 0);
        const end = Position.create(start.line, 1000 * 1000); // The stated behavior of character position is to roll back to line length if it exceeds the line length. This will work for any line <1m characters. That should cover most of them.

        if (start.line > this.textDocument.lineCount) {
            return undefined;
        }

        return this.textDocument.getText(Range.create(start, end));
    }

    public static DocumentManagerConfig: TextDocumentsConfiguration<ComposeDocument> = {
        create: (uri, languageId, version, content) => new ComposeDocument(TextDocument.create(uri, languageId, version, content)),
        update: (document, changes, version) => new ComposeDocument(TextDocument.update(document.textDocument, changes, version)),
    };

    private buildFullCst(): CST.Token[] {
        return Array.from(new Parser().parse(this.textDocument.getText()));
    }

    private buildDocumentCst(): CST.Document {
        // The CST can consist of more than just the document
        // Get the first `type === 'document'` item out of the list; this is the actual document
        const documentCst: CST.Document | undefined = this.fullCst.value.find(t => t.type === 'document') as CST.Document;

        if (!documentCst) {
            // TODO: empty documents are a normal thing but will not have a Document token, that should be handled differently than erroring
            throw new ResponseError(ErrorCodes.ParseError, 'Malformed YAML document');
        }

        return documentCst;
    }

    private buildYamlDocument(): YamlDocument {
        const composedTokens = new Composer().compose(this.fullCst.value, true);
        const [yamlDocument] = composedTokens;

        if (!isDocument(yamlDocument)) {
            // TODO: empty documents are a normal thing but will not have a YamlDocument, that should be handled differently than erroring
            throw new ResponseError(ErrorCodes.ParseError, 'Malformed YAML document');
        }

        return yamlDocument;
    }
}
