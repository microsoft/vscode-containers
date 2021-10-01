/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotificationType, RequestType } from 'vscode-languageserver-protocol';
import { TextDocumentParams } from '../service/ExtendedParams';

// TODO: should we get these from @types/vscode instead? It seems there's some type conflict between `Thenable<T>` from @types/vscode and vscode-jsonrpc preventing @types/vscode from working nicely
export const LF = 1;
export const CRLF = 2;
type EndOfLine = typeof LF | typeof CRLF;

export interface DocumentSettings {
    tabSize: number;
    eol: EndOfLine;
}

export type DocumentSettingsParams = TextDocumentParams;

export interface DocumentSettingsClientCapabilities {
    request: boolean;
    notify: boolean;
}

export type DocumentSettingsNotificationParams = DocumentSettingsParams & DocumentSettings;

export const DocumentSettingsRequestType = new RequestType<DocumentSettingsParams, DocumentSettings, never>('$/textDocument/documentSettings');
export const DocumentSettingsNotificationType = new NotificationType<DocumentSettingsNotificationParams>('$/textDocument/documentSettings/didChange');
