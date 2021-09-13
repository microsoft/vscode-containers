/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionItem, CompletionParams, InsertTextFormat, TextEdit } from 'vscode-languageserver';
import { ExtendedParams } from '../../ExtendedParams';

interface ExtendedCompletionItem extends CompletionItem {
    /**
     * The matching expression
     */
    matcher?: RegExp;

    /**
     * The insertion text does not need to be the same as the label
     */
    insertionText: string;
}

export class CompletionCollection extends Array<ExtendedCompletionItem> {
    public getActiveCompletionItems(params: CompletionParams & ExtendedParams): CompletionItem[] {
        const results: CompletionItem[] = [];

        for (const m of this) {
            const match = m.matcher?.exec(params.document.lineAt(params.position));

            if (match || !m.matcher) {
                const ci = CompletionItem.create(m.label);
                ci.insertTextFormat = m.insertTextFormat ?? InsertTextFormat.Snippet;
                ci.textEdit = TextEdit.insert(params.position, m.insertionText);

                // Copy additional properties
                // TODO: this doesn't copy everything; what else should be added?
                ci.detail = m.detail;
                ci.documentation = m.documentation;
                ci.commitCharacters = m.commitCharacters;
                ci.filterText = m.filterText;

                results.push(ci);
            }
        }

        return results;
    }
}
