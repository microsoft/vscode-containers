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
const PositionAtServicePathRegex = /^\/services\/[.\w-]+$/i; // e.g. /services/foo

/**
 * The position given when the cursor is in a partially-typed properties in a service, i.e. at the | below:
services:
  foo:
    a: b
    b|
 */
const PositionInServiceKeyPathRegex = /^\/services\/[.\w-]+\/<value>$/i; // e.g. /services/foo/<value>

export const ServiceCompletionCollection = new CompletionCollection(
    'service',
    { logicalPaths: [PositionAtServicePathRegex, PositionInServiceKeyPathRegex], indentationDepth: 2 },
    ...[
        {
            label: 'build:',
            insertText: 'build: ${1:path}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: false,
            detail: 'Short form',
            documentation: 'build: <path>',
        },
        {
            label: 'build:',
            insertText: 'build:\n\tcontext: ${1:contextPath}\n\tdockerfile: ${2:Dockerfile}',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
            detail: 'Long form',
            documentation: 'build:\n\tcontext: <contextPath>\n\tdockerfile: <Dockerfile>',
        },
        {
            label: 'command:',
            insertText: 'command: ${1:command}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: false,
            detail: 'String form',
            documentation: 'command: echo hello'
        },
        {
            label: 'command:',
            insertText: 'command: ["${1:executable}", "${2:arg}"]$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: true,
            detail: 'List form',
            documentation: 'command: ["echo", "hello"]'
        },
        {
            label: 'container_name:',
            insertText: 'container_name: ${1:name}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: false,
        },
        {
            label: 'depends_on:',
            insertText: 'depends_on:\n\t- ${1:serviceName}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
        },
        {
            label: 'entrypoint:',
            insertText: 'entrypoint: ${1:entrypoint}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: false,
            detail: 'String form',
            documentation: 'entrypoint: /app/start.sh'
        },
        {
            label: 'entrypoint:',
            insertText: 'entrypoint: ["${1:executable}", "${2:arg}"]$0',
            insertTextFormat: InsertTextFormat.Snippet,
            isAdvancedComposeCompletion: true,
            detail: 'List form',
            documentation: 'entrypoint: ["echo", "hello"]'
        },
        {
            label: 'env_file:',
            insertText: 'env_file:\n\t- ${1:fileName}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
        },
        {
            label: 'environment:',
            insertText: 'environment:\n\t- ${1:name}=${2:value}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
        },
        {
            label: 'expose:',
            insertText: 'expose:\n\t- ${1:1234}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
        },
        {
            label: 'healthcheck:',
            insertText: 'healthcheck:\n\ttest: ["${1:executable}", "${2:arg}"]\n\tinterval: ${3:1m30s}\n\ttimeout: ${4:30s}\n\tretries: ${5:5}\n\tstart_period: ${6:30s}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
        },
        {
            label: 'image:',
            insertText: 'image: ${1:imageName}$0',
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
            label: 'networks:',
            insertText: 'networks:\n\t- ${1:networkName}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
        },
        {
            label: 'ports:',
            insertText: 'ports:\n\t-$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: false,
        },
        {
            label: 'profiles:',
            insertText: 'profiles:\n\t- ${1:profileName}$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: true,
        },
        {
            label: 'volumes:',
            insertText: 'volumes:\n\t-$0',
            insertTextFormat: InsertTextFormat.Snippet,
            insertTextMode: InsertTextMode.adjustIndentation,
            isAdvancedComposeCompletion: false,
        },
    ]
);
