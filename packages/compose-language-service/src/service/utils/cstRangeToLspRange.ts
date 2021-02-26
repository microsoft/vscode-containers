/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CST } from 'yaml/cst';

export function cstRangeToLspRange(document: TextDocument, cstRange: CST.Range | undefined): Range {
    return {
        start: document.positionAt(cstRange?.origStart ?? cstRange?.start ?? 0),
        end: document.positionAt(cstRange?.origEnd ?? cstRange?.end ?? 0),
    };
}
