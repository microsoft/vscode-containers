/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompletionParams, TextDocumentIdentifier, TextDocumentPositionParams } from 'vscode-languageserver';
import { ComposeDocument } from './ComposeDocument';

export interface TextDocumentParams {
    textDocument: TextDocumentIdentifier;
}

export interface ExtendedParams extends TextDocumentParams {
    document: ComposeDocument;
}

export interface ExtendedPositionParams extends ExtendedParams, TextDocumentPositionParams {
}

export interface PositionInfo {
    path: string;
    indentDepth: number;
}

export interface ExtendedCompletionParams extends CompletionParams, ExtendedPositionParams {
    positionInfo: PositionInfo;
}
