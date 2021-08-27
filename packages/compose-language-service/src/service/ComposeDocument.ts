/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ErrorCodes, Position, Range, ResponseError, TextDocumentsConfiguration } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CST, Document as YamlDocument, Parser, Composer, isDocument } from 'yaml';

export class ComposeDocument {
    private constructor(
        public readonly textDocument: TextDocument,
        public readonly fullCst: CST.Token[],
        public readonly documentCst: CST.Document,
        public readonly yamlDocument: YamlDocument,
    ) { }

    private static create(textDocument: TextDocument): ComposeDocument {
        const fullCst = Array.from(new Parser().parse(textDocument.getText()));

        // The CST can consist of more than just the document
        // Get the first `type === 'document'` item out of the list; this is the actual document
        const documentCst: CST.Document | undefined = fullCst.find(t => t.type === 'document') as CST.Document;
        if (!documentCst) {
            throw new ResponseError(ErrorCodes.ParseError, 'Malformed YAML document');
        }

        const composedTokens = new Composer().compose(fullCst, true);
        const [yamlDocument] = composedTokens;

        if (!isDocument(yamlDocument)) {
            throw new ResponseError(ErrorCodes.ParseError, 'Malformed YAML document');
        }

        return new ComposeDocument(textDocument, fullCst, documentCst, yamlDocument);
    }

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
        create: (uri, languageId, version, content) => ComposeDocument.create(TextDocument.create(uri, languageId, version, content)),
        update: (document, changes, version) => ComposeDocument.create(TextDocument.update(document.textDocument, changes, version)),
    };
}
