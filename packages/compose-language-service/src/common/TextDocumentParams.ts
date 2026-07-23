/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TextDocumentIdentifier } from 'vscode-languageserver-protocol';

export interface TextDocumentParams { // This interface ought to exist in `vscode-languageserver`, like `TextDocumentPositionParams`, but here we are...
    textDocument: TextDocumentIdentifier;
}
