/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InsertTextFormat, InsertTextMode } from 'vscode-languageserver';
import { CompletionCollection } from './CompletionCollection';

/**
 * The position given when the cursor is inbetween the service key and first properties, i.e. at the | below:
services:
  foo:
    |
    a: b
 */
const PositionAfterServiceNamePathRegex = /^\/services\/[\w -]+$/i; // e.g. /services/<sep>

/**
 * The position given when the cursor is inbetween properties in a service, i.e. at the | below:
services:
  foo:
    a: b
    |
 */
const PositionInServiceConfigPathRegex = /^\/services\/[\w -]+\/<start>$/i; // e.g. /services/foo/<start>

export const ServiceCompletionCollection = new CompletionCollection(
    { logicalPaths: [PositionAfterServiceNamePathRegex, PositionInServiceConfigPathRegex], indentationDepth: 2 },
    ...[
        {
            label: 'build:',
            insertText: 'build: ${1:path}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'Short form',
            documentation: 'build: <path>',
        },
        {
            label: 'build:',
            insertText: 'build:\n  context: ${1:contextPath}\n  dockerfile: ${2:Dockerfile}',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            detail: 'Long form',
            documentation: 'build:\n  context: <contextPath>\n  dockerfile: <Dockerfile>',
        },
        {
            label: 'command:',
            insertText: 'command: ${1:command}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'String form',
            documentation: 'command: echo hello'
        },
        {
            label: 'command:',
            insertText: 'command: ["${1:executable}", "${2:arg}"]$0',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'List form',
            documentation: 'command: ["echo", "hello"]'
        },
        {
            label: 'container_name:',
            insertText: 'container_name: ${1:name}$0',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'depends_on:',
            insertText: 'depends_on:\n  - ${1:serviceName}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
        },
        {
            label: 'entrypoint:',
            insertText: 'entrypoint: ${1:entrypoint}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'String form',
            documentation: 'entrypoint: /app/start.sh'
        },
        {
            label: 'entrypoint:',
            insertText: 'entrypoint: ["${1:executable}", "${2:arg}"]$0',
            insertTextFormat: InsertTextFormat.Snippet,
            detail: 'List form',
            documentation: 'entrypoint: ["echo", "hello"]'
        },
        {
            label: 'env_file:',
            insertText: 'env_file:\n  - ${1:fileName}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
        },
        {
            label: 'environment:',
            insertText: 'environment:\n  - ${1:name}=${2:value}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
        },
        {
            label: 'expose:',
            insertText: 'expose:\n  - ${1:1234}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
        },
        {
            label: 'healthcheck:',
            insertText: 'healthcheck:\n  test: ["${1:executable}", "${2:arg}"]\n  interval: ${3:1m30s}\n  timeout: ${4:30s}\n  retries: ${5:5}\n  start_period: ${6:30s}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
        },
        {
            label: 'image:',
            insertText: 'image: ${1:imageName}$0',
            insertTextFormat: InsertTextFormat.Snippet,
        },
        {
            label: 'labels:',
            insertText: 'labels:\n  - ${1:com.host.description}=${2:label}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
        },
        {
            label: 'networks:',
            insertText: 'networks:\n  - ${1:networkName}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
        },
        {
            label: 'ports:',
            insertText: 'ports:\n  - ${1:port}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
        },
        {
            label: 'volumes:',
            insertText: 'volumes:\n  - ${1:volume}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
        },
    ]
);
