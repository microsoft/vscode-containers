/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProtocolNotificationType, ProtocolRequestType } from 'vscode-languageserver-protocol';
import { TextDocumentIdentifier } from 'vscode-languageserver-types';

// TODO: should we get these from @types/vscode instead? It seems there's some type conflict between `Thenable<T>` from @types/vscode and vscode-jsonrpc
type LF = 1;
type CRLF = 2;
export type EndOfLine = LF | CRLF;

export interface DocumentSettings {
    tabSize: number;
    eol: EndOfLine;
}

export interface DocumentSettingsParams {
    textDocument: TextDocumentIdentifier;
}

export interface DocumentSettingsClientCapabilities {
    request: boolean;
    notify: boolean;
}

export type DocumentSettingsNotificationParams = DocumentSettingsParams & DocumentSettings;

export const DocumentSettingsRequestType = new ProtocolRequestType<DocumentSettingsParams, DocumentSettings, never, never, never>('$/textDocument/documentSettings');

export const DocumentSettingsNotificationType = new ProtocolNotificationType<DocumentSettingsNotificationParams, never>('$/textDocument/documentSettings/didChange');
