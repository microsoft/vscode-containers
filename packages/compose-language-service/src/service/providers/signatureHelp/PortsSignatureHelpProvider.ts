/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, ParameterInformation, SignatureHelp, SignatureHelpParams, SignatureInformation } from 'vscode-languageserver';
import { ExtendedPositionParams } from '../../ExtendedParams';
import { SubproviderBase } from '../MultiProviderBase';
import { SignatureCollection } from './SignatureCollection';

const PortSignatures = new SignatureCollection(...[
    {
        ...SignatureInformation.create('- "5000"', undefined,
            ParameterInformation.create('5000', 'The container port'),
        ),
        matcher: /(?:^\s*-\s*"?)(\d*)(?:"?\s*$)/i,
    },
    {
        ...SignatureInformation.create('- "5000-5001"', undefined,
            ParameterInformation.create('5000-5001'),
        ),
        matcher: /(?:^\s*-\s*"?)(\d+-\d*)(?:"?\s*$)/i,
    },
    {
        ...SignatureInformation.create('- "5000:5001"', undefined,
            ParameterInformation.create('5000'),
            ParameterInformation.create('5001'),
        ),
        matcher: /(?:^\s*-\s*"?)(\d+)(:\d*)(?:"?\s*$)/i,
    },
    {
        ...SignatureInformation.create('- "5000:5001/tcp"', undefined,
            ParameterInformation.create('5000'),
            ParameterInformation.create('5001/tcp'),
        ),
        matcher: /(?:^\s*-\s*"?)(\d+)(:\d+\/\w*)(?:"?\s*$)/i,
    },
    {
        ...SignatureInformation.create('- "5000-5001:5002-5003"', undefined,
            ParameterInformation.create('5000-5001'),
            ParameterInformation.create('5002-5003'),
        ),
        matcher: /(?:^\s*-\s*"?)(\d+-\d+)(:[\d-]*)(?:"?\s*$)/i,
    },
    {
        ...SignatureInformation.create('- "127.0.0.1:5000:5001"', undefined,
            ParameterInformation.create('127.0.0.1'),
            ParameterInformation.create('5000'),
            ParameterInformation.create('5001'),
        ),
        matcher: /(?:^\s*-\s*"?)([\d]+\.[\d.]*)(:\d*)?(:\d*)?(?:"?\s*?$)/i,
    },
]);

export class PortsSignatureHelpProvider implements SubproviderBase<SignatureHelpParams & ExtendedPositionParams, SignatureHelp, never> {
    public on(params: SignatureHelpParams & ExtendedPositionParams, token: CancellationToken): SignatureHelp | undefined {
        if (!/^\/services\/\w+\/ports\/.+$/i.test(params.extendedPosition.value.logicalPath)) {
            return undefined;
        }

        return {
            signatures: PortSignatures,
            ...PortSignatures.getActiveSignature(params),
        } as SignatureHelp;
    }
}
