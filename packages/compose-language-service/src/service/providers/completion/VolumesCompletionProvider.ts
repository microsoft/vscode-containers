/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CompletionItem, CompletionParams } from 'vscode-languageserver';
import { ExtendedPositionParams } from '../../ExtendedParams';
import { SubproviderBase } from '../MultiProviderBase';
import { CompletionCollection } from './CompletionCollection';

const VolumesCompletions = new CompletionCollection(...[
    {
        // Matches `  - ""` or `  -`, with allowances for other amounts of whitespace
        matcher: /(\s*-\s*)(?<leadingQuote>")?\2\s*$/i,
        label: 'hostPath:containerPath:mode',
        insertionText: '${1:hostPath}:${2:containerPath}:${3|ro,rw|}$0',
    },
    {
        // Matches `  - ""` or `  -`, with allowances for other amounts of whitespace
        matcher: /(\s*-\s*)(?<leadingQuote>")?\2\s*$/i,
        label: 'volumeName:containerPath:mode',
        insertionText: '${1:volumeName}:${2:containerPath}:${3|ro,rw|}$0',
    },
    {
        // Matches `  - "C:\some\path:"` or `  - /some/path:`, with allowances for other amounts of whitespace/quoting
        matcher: /(\s*-\s*)(?<leadingQuote>")?(([a-z]:\\)?[^:"]+):\2\s*$/i,
        label: ':containerPath:mode',
        insertionText: '${2:containerPath}:${3|ro,rw|}$0',
    },
    {
        // Matches `  - "C:\some\path:/another/path:"` or `  - /some/path:/another/path:`, with allowances for other amounts of whitespace/quoting
        matcher: /(\s*-\s*)(?<leadingQuote>")?(([a-z]:\\)?[^:"]+):(([a-z]:\\)?[^:"]+):\2\s*$/i,
        label: ':ro',
        insertionText: 'ro',
    },
    {
        // Matches `  - "C:\some\path:/another/path:"` or `  - /some/path:/another/path:`, with allowances for other amounts of whitespace/quoting
        matcher: /(\s*-\s*)(?<leadingQuote>")?(([a-z]:\\)?[^:"]+):(([a-z]:\\)?[^:"]+):\2\s*$/i,
        label: ':rw',
        insertionText: 'rw',
    },
]);

export class VolumesCompletionProvider implements SubproviderBase<CompletionParams & ExtendedPositionParams, CompletionItem[] | undefined, never> {
    public on(params: CompletionParams & ExtendedPositionParams, token: CancellationToken): CompletionItem[] | undefined {
        if (!/^\/services\/\w+\/volumes\/.+$/i.test(params.extendedPosition.value.logicalPath)) {
            return undefined;
        }

        return VolumesCompletions.getActiveCompletionItems(params);
    }
}
