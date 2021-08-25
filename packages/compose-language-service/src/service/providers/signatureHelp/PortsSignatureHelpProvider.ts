/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, SignatureHelp, SignatureHelpParams } from 'vscode-languageserver';
import { ExtendedPositionParams } from '../../ExtendedParams';
import { SubproviderBase } from '../MultiProviderBase';

export class PortsSignatureHelpProvider implements SubproviderBase<SignatureHelpParams & ExtendedPositionParams, SignatureHelp, never> {
    public on(params: SignatureHelpParams & ExtendedPositionParams, token: CancellationToken): SignatureHelp | undefined {
        return undefined;
    }
}
