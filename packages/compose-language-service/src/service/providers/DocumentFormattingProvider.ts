/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, DocumentFormattingParams, Range, TextEdit } from 'vscode-languageserver';
import { ToStringOptions } from 'yaml';
import { ExtendedParams } from '../ExtendedParams';
import { ProviderBase } from './ProviderBase';

export class DocumentFormattingProvider extends ProviderBase<DocumentFormattingParams & ExtendedParams, TextEdit[] | undefined, never, never> {
    public on(params: DocumentFormattingParams & ExtendedParams, token: CancellationToken): TextEdit[] | undefined {
        if (params.document.yamlDocument.value.errors.length) {
            // Won't return formatting info unless the document is syntactically correct
            return undefined;
        }

        const options: ToStringOptions = {
            indent: params.options.tabSize,
            indentSeq: true,
            simpleKeys: true, // todo?
            nullStr: '',
            lineWidth: 0,
        };

        const range = Range.create(
            params.document.textDocument.positionAt(0),
            params.document.textDocument.positionAt(params.document.textDocument.getText().length) // This technically goes past the end of the doc, but it's OK because the protocol accepts this (positions past the end of the doc are rounded backward)
        );

        const formatted = params.document.yamlDocument.value.toString(options);

        // It's heavy-handed but the replacement is for the entire document
        // TODO is this terrible?
        return [TextEdit.replace(
            range,
            formatted
        )];
    }
}
