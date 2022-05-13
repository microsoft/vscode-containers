/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getAuthContext } from "../../RegistryV2Provider/utils/registryV2Request";
import { expect } from "chai";

describe('(Unit) getAuthContext', function () {
    it('Should return undefined if the status is not 401', function () {
        expect(getAuthContext({
            status: 0,
            statusText: '',
            succeeded: false,
            headers: {},
            body: undefined
        })).to.be.undefined;
    });

    it('Should return undefined if the header is missing', function () {
        expect(getAuthContext({
            status: 401,
            statusText: '',
            succeeded: false,
            headers: { 'one': 'two' },
            body: undefined
        })).to.be.undefined;
    });

    it('Should return undefined if the header is malformed', function () {
        expect(getAuthContext({
            status: 401,
            statusText: '',
            succeeded: false,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { 'www-authenticate': 'two' },
            body: undefined
        })).to.be.undefined;
    });

    it('Should return undefined if the header is only partially formed', function () {
        expect(getAuthContext({
            status: 401,
            statusText: '',
            succeeded: false,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { 'www-authenticate': 'Bearer realm="https://localhost:5442/auth"' },
            body: undefined
        })).to.be.undefined;
    });

    it('Should return auth context if the header is fully formed', function () {
        expect(getAuthContext({
            status: 401,
            statusText: '',
            succeeded: false,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { 'www-authenticate': 'Bearer realm="https://localhost:5442/auth",service="localhost:5443"' },
            body: undefined
        })).to.deep.equal({ realm: 'https://localhost:5442/auth', service: 'localhost:5443' });
    });
});
