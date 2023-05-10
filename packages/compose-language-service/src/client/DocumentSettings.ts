/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotificationType, RequestType } from 'vscode-languageserver-protocol';
import { TextDocumentParams } from '../service/ExtendedParams';

export type DocumentSettingsClientCapabilities = {
    readonly request: boolean,
    readonly notify: boolean,
};

// TODO: can we get these from @types/vscode instead? It seems there's some type conflict between `Thenable<T>` from @types/vscode and vscode-jsonrpc preventing @types/vscode from working nicely
export const LF = 1;
export const CRLF = 2;
type EndOfLine = typeof LF | typeof CRLF;

export interface DocumentSettings {
    tabSize: number;
    eol: EndOfLine;
}

export type DocumentSettingsParams = TextDocumentParams;

// Use the same syntax as the LSP
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace DocumentSettingsRequest {
    export const method = '$/textDocument/documentSettings' as const;
    export const type = new RequestType<DocumentSettingsParams, DocumentSettings | null, never>(method);
}

export type DocumentSettingsNotificationParams = DocumentSettingsParams & DocumentSettings;

// Use the same syntax as the LSP
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace DocumentSettingsNotification {
    export const method = '$/textDocument/documentSettings/didChange' as const;
    export const type = new NotificationType<DocumentSettingsNotificationParams>(method);
}
