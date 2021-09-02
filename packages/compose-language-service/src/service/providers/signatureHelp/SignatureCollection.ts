/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SignatureHelpParams, SignatureInformation } from 'vscode-languageserver';
import { ExtendedParams } from '../../ExtendedParams';
import { computeRegExpSpans } from '../../utils/computeRegExpSpans';

interface ExtendedSignatureInformation extends SignatureInformation {
    /**
     * This RegExp must have exactly as many capturing groups as there are parameters in the `SignatureInformation`
     * There can be no overlap between groups (i.e. one group cannot be nested within another), and there can be
     * no gap inbetween groups (text before and after does not need to be captured)
     */
    matcher: RegExp;
}

export class SignatureCollection extends Array<ExtendedSignatureInformation>{
    public getActiveSignature(params: SignatureHelpParams & ExtendedParams): { activeSignature: number | null, activeParameter: number | null } {
        let activeSignature: number | null = null;
        let activeParameter: number | null = null;

        for (let i = 0; i < this.length; i++) {
            const match = this[i].matcher.exec(params.document.lineAt(params.position));

            if (match) {
                // Found a signature that matches the current line contents
                activeSignature = i;

                if (!params.clientCapabilities.textDocument?.signatureHelp?.signatureInformation?.activeParameterSupport) {
                    break;
                }

                // Now, need to find which parameter we're in, based on the position in the line
                const spans = computeRegExpSpans(match).slice(1); // Slice the first item off which is always the full match

                activeParameter = spans.findIndex(s => s.index < params.position.character && (s.index + s.length) >= params.position.character);

                if (activeParameter === -1) {
                    const first = spans[0];
                    const last = spans[spans.length - 1];

                    if (params.position.character < first.index) {
                        activeParameter = 0;
                    } else if (params.position.character > last.index + last.length) {
                        activeParameter = spans.length - 1;
                    }

                    // If still not found, set to null
                    if (activeParameter === -1) {
                        activeParameter = null;
                    }
                }

                break;
            }
        }

        return {
            activeSignature,
            activeParameter,
        };
    }
}
