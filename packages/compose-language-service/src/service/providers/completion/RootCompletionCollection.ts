/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InsertTextFormat } from 'vscode-languageserver';
import { CompletionCollection } from './CompletionCollection';

const PositionAtRootRegex = /^\/$/i; // e.g. `/`

export const RootCompletionCollection = new CompletionCollection(
    { logicalPaths: [PositionAtRootRegex], indentationDepth: 0 },
    ...[
        {
            label: 'configs:',
            insertText: 'configs:\n',
        },
        {
            label: 'networks:',
            insertText: 'networks:\n',
        },
        {
            label: 'secrets:',
            insertText: 'secrets:\n',
        },
        {
            label: 'services:',
            insertText: 'services:\n',
        },
        {
            label: 'version:',
            insertText: 'version: \'${1:version}\'$0',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'volumes:',
            insertText: 'volumes:\n',
        },
    ]
);
