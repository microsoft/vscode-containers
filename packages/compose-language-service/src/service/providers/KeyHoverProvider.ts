/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Hover, HoverParams, MarkupContent } from 'vscode-languageserver';
import { CST } from 'yaml';
import { ComposeDocument } from '../ComposeDocument';
import { ExtendedPosition } from '../ExtendedPosition';
import { yamlRangeToLspRange } from '../utils/yamlRangeToLspRange';

export class KeyHoverProvider {
    public static async onHover(params: HoverParams & { doc: ComposeDocument }, token: CancellationToken): Promise<Hover | undefined> {
        const extendedPosition = ExtendedPosition.build(params.doc, params.position);

        if (extendedPosition.itemType === 'key' && CST.isScalar(extendedPosition.item.key)) {
            const keyInfo = ComposeKeyInfo.find((k) => k.pathRegex.test(extendedPosition.logicalPath));

            if (keyInfo) {
                return {
                    contents: keyInfo.contents,
                    range: yamlRangeToLspRange(params.doc.textDocument, [extendedPosition.item.key.offset, extendedPosition.item.key.offset + extendedPosition.item.key.source.length]),
                };
            }
        }

        return undefined;
    }
}

interface ComposeKeyInformation {
    pathRegex: RegExp,
    contents: MarkupContent,
}

const ComposeKeyInfo: ComposeKeyInformation[] = [
    {
        pathRegex: /^\/services$/i,
        contents: {
            kind: 'markdown',
            value: 'The services in your compose project',
        },
    },
];
