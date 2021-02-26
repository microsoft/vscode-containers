/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';

export function cstRangeToLspRange(document: TextDocument, cstRange: [number, number] | undefined): Range {
    return {
        start: document.positionAt(cstRange?.[0] ?? 0),
        end: document.positionAt(cstRange?.[1] ?? 0),
    };
}
