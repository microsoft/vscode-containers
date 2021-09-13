/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ErrorCodes, Position, Range, ResponseError, TextDocumentsConfiguration } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CST, Document as YamlDocument, Parser, Composer, isDocument } from 'yaml';
import { Lazy } from './utils/Lazy';

const EmptyDocumentCST: CST.Document = {
    type: 'document',
    offset: 0,
    start: [],
};

// The stated behavior of character number in the `Position` class is to roll back to line length if it exceeds the line length. So, this will work for any line <1m characters. That should cover most of them.
const MaximumLineLength = 1000 * 1000;

export class ComposeDocument {
    public readonly fullCst = new Lazy(() => this.buildFullCst());
    public readonly documentCst = new Lazy(() => this.buildDocumentCst());
    public readonly yamlDocument = new Lazy(() => this.buildYamlDocument());

    private constructor(
        public readonly textDocument: TextDocument,
    ) { }

    public lineAt(line: Position | number): string {
        // Flatten to a position at the start of the line
        const startOfLine = (typeof line === 'number') ? Position.create(line, 0) : Position.create(line.line, 0);
        const endOfLine = Position.create(startOfLine.line, MaximumLineLength);

        if (startOfLine.line > this.textDocument.lineCount) {
            throw new Error(`Requested line ${startOfLine.line} is out of bounds.`);
        }

        return this.textDocument.getText(Range.create(startOfLine, endOfLine));
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
        // If there isn't one, return `EmptyDocumentCST`
        return this.fullCst.value.find(t => t.type === 'document') as CST.Document || EmptyDocumentCST;
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
