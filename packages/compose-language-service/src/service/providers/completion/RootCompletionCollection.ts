/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InsertTextFormat } from 'vscode-languageserver';
import { CompletionCollection } from './CompletionCollection';

/**
 * The position given when the cursor is at the root, i.e. at the | below:
|
services:
  foo:
    a: b
 */
const PositionAtRootPathRegex = /^\/$/i; // e.g. /

/**
 * The position given when the cursor is in a partially-typed root key, i.e. at the | below:
val|
services:
  foo:
    a: b
 */
const PositionInRootKeyPathRegex = /^\/<value>$/i; // e.g. /<value>

export const RootCompletionCollection = new CompletionCollection(
    'root',
    { logicalPaths: [PositionAtRootPathRegex, PositionInRootKeyPathRegex], indentationDepth: 0 },
    ...[
        {
            label: 'configs:',
            insertText: 'configs:\n',
            insertTextFormat: InsertTextFormat.PlainText,
            isAdvancedComposeCompletion: false,
        },
        {
            label: 'networks:',
            insertText: 'networks:\n',
            insertTextFormat: InsertTextFormat.PlainText,
            isAdvancedComposeCompletion: false,
        },
        {
            label: 'secrets:',
            insertText: 'secrets:\n',
            insertTextFormat: InsertTextFormat.PlainText,
            isAdvancedComposeCompletion: false,
        },
        {
            label: 'services:',
            insertText: 'services:\n',
            insertTextFormat: InsertTextFormat.PlainText,
            isAdvancedComposeCompletion: false,
        },
        {
            label: 'version:',
            insertText: 'version: \'${1:version}\'$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: false,
        },
        {
            label: 'volumes:',
            insertText: 'volumes:\n',
            insertTextFormat: InsertTextFormat.PlainText,
            isAdvancedComposeCompletion: false,
        },
    ]
);
