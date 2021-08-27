/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, ParameterInformation, SignatureHelp, SignatureHelpParams, SignatureHelpTriggerKind, SignatureInformation } from 'vscode-languageserver';
import { ExtendedPositionParams } from '../../ExtendedParams';
import { SubproviderBase } from '../MultiProviderBase';

interface PortSignature {
    info: SignatureInformation;
    match: RegExp;
}

const DefaultPortSignatures: PortSignature[] = [
    {
        info: SignatureInformation.create('- "5000"', undefined,
            ParameterInformation.create('5000'),
        ),
        match: /^-\s*"?\d*"?$/i, // Matches by default and any number of digits up to the end of the string
    },
    {
        info: SignatureInformation.create('- "5000-5001"', undefined,
            ParameterInformation.create('5000-5001'),
        ),
        match: /^-\s*"?\d+-\d*"?$/i, // Matches a number followed by `-` followed by any number of digits up to the end of the string
    },
    {
        info: SignatureInformation.create('- "5000:5001"', undefined,
            ParameterInformation.create('5000'),
            ParameterInformation.create('5001'),
        ),
        match: /^-\s*"?\d+:\d*"?$/i, // Matches a number followed by `:` followed by any number of digits up to the end of the string
    },
    {
        info: SignatureInformation.create('- "5000:5001/tcp"', undefined,
            ParameterInformation.create('5000'),
            ParameterInformation.create('5001/tcp'),
        ),
        match: /^-\s*"?\d+:\d+\//i, // Matches a number, then `:`, then a number followed by `/`
    },
    {
        info: SignatureInformation.create('- "5000-5001:5002-5003"', undefined,
            ParameterInformation.create('5000-5001'),
            ParameterInformation.create('5002-5003'),
        ),
        match: /^-\s*"?\d+-\d+:/i,  // Matches a number, then `-`, then a number, then `:`
    },
    {
        info: SignatureInformation.create('- "127.0.0.1:5000:5001"', undefined,
            ParameterInformation.create('127.0.0.1:5000'),
            ParameterInformation.create('5001'),
        ),
        match: /^-\s*"?\d+\./i, // Matches a number then `.`
    },
];

export class PortsSignatureHelpProvider implements SubproviderBase<SignatureHelpParams & ExtendedPositionParams, SignatureHelp, never> {
    public on(params: SignatureHelpParams & ExtendedPositionParams, token: CancellationToken): SignatureHelp | undefined {
        if (params.context?.activeSignatureHelp && params.context?.triggerKind === SignatureHelpTriggerKind.ContentChange) {
            // The content changed to cause this retrigger. New signatures will not be computed, instead just the `activeSignature` and `activeParameter` will be updated.
            return {
                signatures: params.context.activeSignatureHelp.signatures,
                ...this.determineActiveSignatureAndParameter(params),
            };
        }

        if (!/^\/services\/\w+\/ports\/.+$/i.test(params.extendedPosition.value.logicalPath)) {
            return undefined;
        }

        return {
            signatures: DefaultPortSignatures.map(s => s.info),
            ...this.determineActiveSignatureAndParameter(params),
        };
    }

    private determineActiveSignatureAndParameter(params: SignatureHelpParams & ExtendedPositionParams): { activeSignature: number | null, activeParameter: number | null } {
        const lineContent = params.document.lineAt(params.position)?.trim() ?? '';
        let activeSignature: number | null = null;
        let activeParameter: number | null = null;

        activeSignature = DefaultPortSignatures.findIndex(s => s.match.test(lineContent));

        if (activeSignature < 0) {
            activeSignature = null;
        } else {
            if (DefaultPortSignatures[activeSignature].info.parameters?.length ?? 0 > 1) {
                activeParameter = (lineContent.indexOf(':') > -1) ? 1 : 0; // TODO: this is incorrect for the "hostIp:hostPort:containerPort" format due to two `:`
            } else {
                activeParameter = 0;
            }
        }

        return {
            activeSignature,
            activeParameter,
        };
    }
}
