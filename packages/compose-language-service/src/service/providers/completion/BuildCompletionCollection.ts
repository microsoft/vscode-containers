/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InsertTextFormat, InsertTextMode } from 'vscode-languageserver';
import { CompletionCollection } from './CompletionCollection';

/**
 * The position given when the cursor is inbetween the build key and first properties, i.e. at the | below:
services:
  foo:
    build:
      |
      a: b
 */
const PositionAtBuildPathRegex = /^\/services\/[.\w-]+\/build$/i; // e.g. /services/foo/build

/**
 * The position given when the cursor is in a partially-typed properties in a service build, i.e. at the | below:
services:
  foo:
    build:
      a: b
      b|
 */
const PositionInBuildKeyPathRegex = /^\/services\/[.\w-]+\/build\/<value>$/i; // e.g. /services/foo/build/<value>

export const BuildCompletionCollection = new CompletionCollection(
    'build',
    { logicalPaths: [PositionAtBuildPathRegex, PositionInBuildKeyPathRegex], indentationDepth: 3 },
    ...[
        {
            label: 'args:',
            insertText: 'args:\n\t- ${1:name}=${2:value}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
        },
        {
            label: 'context:',
            insertText: 'context: ${1:buildContext}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: false,
        },
        {
            label: 'dockerfile:',
            insertText: 'dockerfile: ${1:dockerfile}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: false,
        },
        {
            label: 'labels:',
            insertText: 'labels:\n\t- ${1:com.host.description}=${2:label}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
        },
        {
            label: 'network:',
            insertText: 'network: ${1:networkName}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: false,
        },
        {
            label: 'target:',
            insertText: 'target: ${1:targetStage}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: false,
        },
    ]
);
