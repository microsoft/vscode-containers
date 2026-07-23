/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NoShell } from '@microsoft/vscode-processutils';
import { expect } from 'chai';
import { withNerdctlExposedPortsArg } from '../clients/NerdctlClient/withNerdctlExposedPortsArg';

function quote(exposePorts: Array<number> | undefined, publishAllPorts: boolean | undefined): string[] {
    return new NoShell(false).quote(withNerdctlExposedPortsArg(exposePorts, publishAllPorts)());
}

describe('(unit) withNerdctlExposedPortsArg', () => {
    it('Should convert exposed ports to -p args when publishAllPorts is true', () => {
        expect(quote([3000, 4000], true)).to.deep.equal(['-p', '3000', '-p', '4000']);
    });

    it('Should emit nothing when publishAllPorts is false', () => {
        expect(quote([3000, 4000], false)).to.deep.equal([]);
    });

    it('Should emit nothing when publishAllPorts is undefined', () => {
        expect(quote([3000], undefined)).to.deep.equal([]);
    });

    it('Should emit nothing when exposePorts is empty or undefined', () => {
        expect(quote([], true)).to.deep.equal([]);
        expect(quote(undefined, true)).to.deep.equal([]);
    });
});
