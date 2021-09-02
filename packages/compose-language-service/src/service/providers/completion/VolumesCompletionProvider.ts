/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CompletionItem, CompletionParams, InsertTextFormat, TextEdit } from 'vscode-languageserver';
import { ExtendedPositionParams } from '../../ExtendedParams';
import { SubproviderBase } from '../MultiProviderBase';

interface CompletionMatcher {
    matcher: RegExp;
    label: string;
    insertionText: string;
}

const VolumeMatchers: CompletionMatcher[] = [
    {
        matcher: /(\s*-\s*)(?<leadingQuote>")?\2\s*$/i,
        label: 'hostPath:containerPath:mode',
        insertionText: '${1:hostPath}:${2:containerPath}:${3|ro,rw|}$0',
    },
    {
        matcher: /(\s*-\s*)(?<leadingQuote>")?\2\s*$/i,
        label: 'volumeName:containerPath:mode',
        insertionText: '${1:volumeName}:${2:containerPath}:${3|ro,rw|}$0',
    },
    {
        matcher: /(\s*-\s*)(?<leadingQuote>")?(([a-z]:\\)?[^:"]+):\2\s*$/i,
        label: ':containerPath:mode',
        insertionText: '${2:containerPath}:${3|ro,rw|}$0',
    },
    {
        matcher: /(\s*-\s*)(?<leadingQuote>")?(([a-z]:\\)?[^:"]+):(([a-z]:\\)?[^:"]+):\2\s*$/i,
        label: ':ro',
        insertionText: 'ro',
    },
    {
        matcher: /(\s*-\s*)(?<leadingQuote>")?(([a-z]:\\)?[^:"]+):(([a-z]:\\)?[^:"]+):\2\s*$/i,
        label: ':rw',
        insertionText: 'rw',
    },
];

export class VolumesCompletionProvider implements SubproviderBase<CompletionParams & ExtendedPositionParams, CompletionItem[] | undefined, never> {
    public on(params: CompletionParams & ExtendedPositionParams, token: CancellationToken): CompletionItem[] | undefined {
        if (!/^\/services\/\w+\/volumes\/.+$/i.test(params.extendedPosition.value.logicalPath)) {
            return undefined;
        }

        const results: CompletionItem[] = [];

        for (const m of VolumeMatchers) {
            const match = m.matcher.exec(params.document.lineAt(params.position));

            if (match) {
                const ci = CompletionItem.create(m.label);
                ci.insertTextFormat = InsertTextFormat.Snippet;
                ci.textEdit = TextEdit.insert(params.position, m.insertionText);
                results.push(ci);
            }
        }

        return results;
    }
}
