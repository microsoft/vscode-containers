/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { FinchClient } from '../../../clients/FinchClient/FinchClient';
import { NerdctlClient } from '../../../clients/NerdctlClient/NerdctlClient';
import type { VersionItem } from '../../../contracts/ContainerClient';

class TestFinchClient extends FinchClient {
    public parseVersion(output: string, strict: boolean): Promise<VersionItem> {
        return this.parseVersionCommandOutput(output, strict);
    }
}

// The real shape of `finch version --format '{{json .}}'`
const finchVersionOutput = JSON.stringify({
    Client: {
        Version: 'v1.7.0',
        GitCommit: '0123456789abcdef0123456789abcdef01234567',
        NerdctlClient: {
            Version: '2.0.3',
            GitCommit: 'fedcba9876543210fedcba9876543210fedcba98',
            Os: 'linux',
            Arch: 'amd64',
        },
    },
    Server: {
        Components: [
            { Name: 'containerd', Version: '1.7.24' },
            { Name: 'runc', Version: '1.2.2' },
        ],
    },
});

// The shape of `nerdctl version --format '{{json .}}'`, i.e. no `Client.NerdctlClient`
const nerdctlVersionOutput = JSON.stringify({
    Client: {
        Version: '2.0.3',
        Os: 'linux',
        Arch: 'amd64',
    },
    Server: {
        Components: [
            { Name: 'containerd', Version: '1.7.24' },
        ],
    },
});

describe('(unit) FinchClient', () => {
    describe('ClientId', () => {
        it('Should use the Finch client ID and not inherit the nerdctl one', () => {
            const client = new FinchClient();

            expect(client.id).to.equal(FinchClient.ClientId);
            expect(client.id).to.not.equal(NerdctlClient.ClientId);
        });

        it('Should not change the nerdctl client ID', () => {
            expect(new NerdctlClient().id).to.equal(NerdctlClient.ClientId);
        });
    });

    describe('parseVersionCommandOutput', () => {
        const client = new TestFinchClient();

        it('Should report the nerdctl version from the Finch version output', async () => {
            const version = await client.parseVersion(finchVersionOutput, true);

            expect(version.client).to.equal('2.0.3');
            expect(version.server).to.equal('1.7.24');
        });

        it('Should fall back to Client.Version when NerdctlClient is absent', async () => {
            const version = await client.parseVersion(nerdctlVersionOutput, true);

            expect(version.client).to.equal('2.0.3');
            expect(version.server).to.equal('1.7.24');
        });

        it('Should throw on unparseable output when strict', () => {
            expect(() => client.parseVersion('this is not JSON', true)).to.throw();
        });

        it('Should return unknown on unparseable output when not strict', async () => {
            const version = await client.parseVersion('this is not JSON', false);

            expect(version.client).to.equal('unknown');
            expect(version.server).to.be.undefined;
        });

        it('Should return unknown when the version output has no version fields', async () => {
            const version = await client.parseVersion(JSON.stringify({ Client: {} }), false);

            expect(version.client).to.equal('unknown');
            expect(version.server).to.be.undefined;
        });
    });
});
