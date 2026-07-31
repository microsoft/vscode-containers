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

// The real shape of `finch version --format '{{json .}}'`, captured from Finch v1.17.2.
// Note the `v` prefix on versions, and that `NerdctlClient` carries its own nested
// `Components` array (not modelled in the schema; Zod strips it).
const finchVersionOutput = JSON.stringify({
    Client: {
        Version: 'v1.17.2',
        GitCommit: 'c0f8e88c60793fa0a92030136c2281bdbf06683c',
        NerdctlClient: {
            Version: 'v2.2.2',
            GitCommit: '20bbfaa940ddc532b8587ac6aeef88e76c8abf77',
            GoVersion: 'go1.25.8',
            Os: 'linux',
            Arch: 'amd64',
            Components: [
                { Name: 'buildctl', Version: 'v0.28.1', Details: { GitCommit: '45b038cd0b2ec2d34013ce0f085522276f7ee0d8' } },
            ],
        },
    },
    Server: {
        Components: [
            { Name: 'containerd', Version: 'v2.2.1', Details: { GitCommit: 'dea7da592f5d1d2b7755e3a161be07f43fad8f75' } },
            { Name: 'runc', Version: '1.4.0', Details: { GitCommit: 'v1.4.0-0-g8bd78a9' } },
        ],
    },
});

// The shape of `nerdctl version --format '{{json .}}'`, i.e. no `Client.NerdctlClient`
const nerdctlVersionOutput = JSON.stringify({
    Client: {
        Version: 'v2.2.2',
        Os: 'linux',
        Arch: 'amd64',
    },
    Server: {
        Components: [
            { Name: 'containerd', Version: 'v2.2.1' },
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

            expect(version.client).to.equal('v2.2.2');
            expect(version.server).to.equal('v2.2.1');
        });

        it('Should fall back to Client.Version when NerdctlClient is absent', async () => {
            const version = await client.parseVersion(nerdctlVersionOutput, true);

            expect(version.client).to.equal('v2.2.2');
            expect(version.server).to.equal('v2.2.1');
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
