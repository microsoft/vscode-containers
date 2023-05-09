/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InsertTextFormat, InsertTextMode } from 'vscode-languageserver';
import { CompletionCollection } from './CompletionCollection';

// Matches `  - ""` or `  -`, with allowances for other amounts of whitespace/quoting
const PortItemStartRegex = /(\s*-\s*)(?<leadingQuote>"|')?\2\s*$/i;

export const PortsCompletionCollection = new CompletionCollection(
    'ports',
    { logicalPaths: [/^\/services\/[.\w-]+\/ports\/<item>\/.*$/i], indentationDepth: 3 },
    ...[
        {
            matcher: PortItemStartRegex,
            label: 'containerPort',
            insertText: '"${1:80}"$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: false,
        },
        {
            matcher: PortItemStartRegex,
            label: 'hostPort:containerPort',
            insertText: '"${1:8080}:${2:80}"$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: true,
        },
        {
            matcher: PortItemStartRegex,
            label: 'hostPort:containerPort/protocol',
            insertText: '"${1:8080}:${2:80}/${3|tcp,udp|}"$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: true,
        },
        {
            matcher: PortItemStartRegex,
            label: 'hostRange:containerRange',
            insertText: '"${1:8080}-${2:8081}:${3:80}-${4:81}"$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: true,
        },
        {
            matcher: PortItemStartRegex,
            label: '(Long form port specification)',
            insertText: 'target: ${1:80}\n  published: ${2:8080}\n  protocol: ${3|tcp,udp|}\n  mode: ${4|host,ingress|}$0', // These are intentionally always two spaces, not the auto-replaced tabs; this is a flow map and must align to the first item which is after `- `
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
            documentation: 'target: <containerPort>\n  published: <hostPort>\n  protocol: <udp, tcp>\n  mode: <host, ingress>',
            sortText: 'zzz', // Force this to sort to the bottom
        },
    ]
);
