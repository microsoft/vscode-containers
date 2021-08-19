/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range as LspRange } from 'vscode-languageserver';
import { Range as YamlRange } from 'yaml/dist/nodes/Node';
import { TextDocument } from 'vscode-languageserver-textdocument';

export function yamlRangeToLspRange(document: TextDocument, yamlRange: YamlRange | [number, number]): LspRange {
    return {
        start: document.positionAt(yamlRange[0]),
        end: document.positionAt(yamlRange[1]),
    };
}
