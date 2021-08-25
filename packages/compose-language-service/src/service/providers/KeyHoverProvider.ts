/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Hover, HoverParams, MarkupContent, MarkupKind } from 'vscode-languageserver';
import { CST } from 'yaml';
import { ComposeLanguageService } from '../ComposeLanguageService';
import { ExtendedParams } from '../ExtendedParams';
import { ExtendedPosition } from '../ExtendedPosition';
import { yamlRangeToLspRange } from '../utils/yamlRangeToLspRange';
import { ProviderBase } from './ProviderBase';

export class KeyHoverProvider extends ProviderBase {
    private readonly preferMarkdown: boolean;

    public constructor(languageService: ComposeLanguageService) {
        super(languageService);

        // Determine client's preferred content format. If `contentFormat` is undefined or empty, we assume plaintext.
        const contentFormat = this.clientCapabilities.textDocument?.hover?.contentFormat;
        this.preferMarkdown = contentFormat?.length ? contentFormat?.[0] === MarkupKind.Markdown : false;
    }

    public onHover(params: HoverParams & ExtendedParams, token: CancellationToken): Hover | undefined {
        if (!this.clientCapabilities.textDocument?.hover) {
            return undefined;
        }

        const extendedPosition = ExtendedPosition.build(params.document, params.position);

        if (extendedPosition.itemType === 'key' && CST.isScalar(extendedPosition.item.key)) {
            const keyInfo = ComposeKeyInfo.find((k) => k.pathRegex.test(extendedPosition.logicalPath));

            if (keyInfo) {
                return {
                    contents: this.preferMarkdown ? keyInfo.markdownContents : keyInfo.plaintextContents,
                    range: yamlRangeToLspRange(params.document.textDocument, [extendedPosition.item.key.offset, extendedPosition.item.key.offset + extendedPosition.item.key.source.length]),
                };
            }
        }

        return undefined;
    }
}

interface ComposeKeyInformation {
    pathRegex: RegExp,
    markdownContents: MarkupContent,
    plaintextContents: MarkupContent,
}

const ComposeKeyInfo: ComposeKeyInformation[] = [
    {
        pathRegex: /^\/services$/i,
        markdownContents: {
            kind: 'markdown',
            value: 'The services in your compose project',
        },
        plaintextContents: {
            kind: 'plaintext',
            value: 'The services in your compose project',
        },
    },
];
