/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InsertTextFormat } from 'vscode-languageserver';
import { CompletionCollection } from './CompletionCollection';

export const VolumesCompletionCollection = new CompletionCollection(
    { logicalPaths: [/^\/services\/[.\w-]+\/volumes\/<item>\/.*$/i], indentationDepth: 3 },
    ...[
        {
            // Matches `  - ""` or `  -`, with allowances for other amounts of whitespace/quoting
            matcher: /(\s*-\s*)(?<leadingQuote>"|')?\2\s*$/i,
            label: 'hostPath:containerPath:mode',
            insertText: '${1:hostPath}:${2:containerPath}:${3|ro,rw|}$0',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            // Matches `  - ""` or `  -`, with allowances for other amounts of whitespace/quoting
            matcher: /(\s*-\s*)(?<leadingQuote>"|')?\2\s*$/i,
            label: 'volumeName:containerPath:mode',
            insertText: '${1:volumeName}:${2:containerPath}:${3|ro,rw|}$0',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            // Matches `  - "C:\some\path:"` or `  - /some/path:`, with allowances for other amounts of whitespace/quoting
            matcher: /(\s*-\s*)(?<leadingQuote>"|')?(([a-z]:\\)?[^:"]+):\2\s*$/i,
            label: ':containerPath:mode',
            insertText: '${2:containerPath}:${3|ro,rw|}$0',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            // Matches `  - "C:\some\path:/another/path:"` or `  - /some/path:/another/path:`, with allowances for other amounts of whitespace/quoting
            matcher: /(\s*-\s*)(?<leadingQuote>"|')?(([a-z]:\\)?[^:"]+):(([a-z]:\\)?[^:"]+):\2\s*$/i,
            label: ':ro',
            insertText: 'ro',
            detail: 'Read-only',
        },
        {
            // Matches `  - "C:\some\path:/another/path:"` or `  - /some/path:/another/path:`, with allowances for other amounts of whitespace/quoting
            matcher: /(\s*-\s*)(?<leadingQuote>"|')?(([a-z]:\\)?[^:"]+):(([a-z]:\\)?[^:"]+):\2\s*$/i,
            label: ':rw',
            insertText: 'rw',
            detail: 'Read-write',
        },
    ]
);
