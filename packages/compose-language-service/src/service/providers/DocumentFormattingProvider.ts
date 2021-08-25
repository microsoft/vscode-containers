/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, DocumentFormattingParams, Range, TextEdit } from 'vscode-languageserver';
import { ToStringOptions } from 'yaml';
import { ExtendedParams } from '../ExtendedParams';
import { ProviderBase } from './ProviderBase';

export class DocumentFormattingProvider extends ProviderBase {
    public onDocumentFormatting(params: DocumentFormattingParams & ExtendedParams, token: CancellationToken): TextEdit[] | undefined {
        if (!this.clientCapabilities.textDocument?.formatting) {
            return undefined;
        }

        if (params.document.yamlDocument.errors.length) {
            // Won't return formatting info unless the document is syntactically correct
            return undefined;
        }

        const options: ToStringOptions = {
            indent: params.options.tabSize,
            indentSeq: true,
            simpleKeys: true, // todo?
        };

        const range = Range.create(
            params.document.textDocument.positionAt(0),
            params.document.textDocument.positionAt(params.document.textDocument.getText().length - 1)
        );

        const formatted = params.document.yamlDocument.toString(options);

        // It's heavy-handed but the replacement is for the entire document
        // TODO is this terrible?
        return [TextEdit.replace(
            range,
            formatted
        )];
    }
}
