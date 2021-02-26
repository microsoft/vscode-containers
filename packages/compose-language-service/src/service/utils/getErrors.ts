/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ParsedCST } from 'yaml';
import { CST } from 'yaml/cst';
import { Type, YAMLError } from 'yaml/util';

export function getErrors(cst: ParsedCST): YAMLError[] {
    const results: YAMLError[] = [];

    for (const doc of cst) {
        getErrorsRecursive(doc, results);
    }

    return results;
}

function getErrorsRecursive(node: CST.Node | null | undefined, results: YAMLError[]): void {
    if (!node) {
        return;
    }

    if (node.error) {
        results.push(node.error);
    }

    switch (node.type) {
        case Type.DOCUMENT:
            // Documents have a collection of contents
            for (const content of (<CST.Document>node).contents) {
                getErrorsRecursive(content, results);
            }

            break;

        case Type.SEQ:
        case Type.MAP:
        case Type.FLOW_SEQ:
        case Type.FLOW_MAP:
            // Sequences and maps have a collection of items
            for (const item of (<CST.FlowCollection | CST.Seq | CST.Map>node).items) {
                if ('type' in item) {
                    // FlowChar is a possible item in FlowCollection but it is not a node
                    // It does not have the 'type' field
                    getErrorsRecursive(item, results);
                }
            }

            break;

        case Type.SEQ_ITEM:
        case Type.MAP_KEY:
        case Type.MAP_VALUE:
            // Sequence and map items have a node
            getErrorsRecursive((<CST.SeqItem | CST.MapItem>node).node, results);
            break;

        default:
            // Leaf value (scalar, comment, blankline, directive, etc.)
            break;
    }
}
