/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionItem } from 'vscode-languageserver';
import { ExtendedCompletionParams } from '../../ExtendedParams';

interface ExtendedCompletionItem extends CompletionItem {
    /**
     * The matching expression
     */
    matcher?: RegExp;

    /**
     * Insert text is required in ExtendedCompletionItem
     */
    insertText: string;

    /**
     * Whether a completion is an advanced compose completion
     */
    isAdvancedComposeCompletion: boolean;

    // TODO: in the long run, we should use `InsertReplaceEdit` to avoid client-side interpretation and make a more client-agnostic server
    // TODO: However, using `insertText` instead of `textEdit`, the behavior for 24x7 completions is closer in-line to what we want at least in VSCode
}

export class CompletionCollection extends Array<ExtendedCompletionItem> {
    public constructor(
        public readonly name: string,
        private readonly locationRequirements: CompletionLocationRequirements,
        ...items: ExtendedCompletionItem[]
    ) {
        super(...items);
    }

    public getActiveCompletionItems(params: ExtendedCompletionParams): CompletionItem[] | undefined {
        if (this.locationRequirements.logicalPaths !== undefined && !this.locationRequirements.logicalPaths.some(p => p.test(params.positionInfo.path ?? ''))) {
            return undefined; // Reject this collection: the logical path requirement is not satisfied
        }

        if (this.locationRequirements.indentationDepth !== undefined && this.locationRequirements.indentationDepth !== params.positionInfo.indentDepth) {
            return undefined; // Reject this collection: the indentation depth requirement is not satisfied
        }

        const line = params.document.lineAt(params.position);
        return this
            .filter(eci => (params.basicCompletions && !eci.isAdvancedComposeCompletion) || (params.advancedCompletions && eci.isAdvancedComposeCompletion))
            .filter(eci => !eci.matcher || eci.matcher.test(line));
    }
}

interface CompletionLocationRequirements {
    logicalPaths?: RegExp[];
    indentationDepth?: number;
}
