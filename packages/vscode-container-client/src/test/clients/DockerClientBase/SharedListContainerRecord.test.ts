/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { describe, it } from 'mocha';
import {
    DockerListContainerOptions,
    NerdctlListContainerOptions,
    SharedListContainerRecordSchema,
    normalizeContainerState,
    normalizeListContainerRecord,
} from '../../../clients/DockerClientBase/SharedListContainerRecord';

describe('(unit) normalizeContainerState', () => {

    it('Should use the state if it is present', () => {
        expect(normalizeContainerState({ State: 'running', Status: 'Ignore' })).to.equal('running');
        expect(normalizeContainerState({ State: 'exited', Status: 'Ignore' })).to.equal('exited');
        expect(normalizeContainerState({ State: 'paused', Status: 'Ignore' })).to.equal('paused');
        expect(normalizeContainerState({ State: 'fake', Status: 'Ignore' })).to.equal('fake');
    });

    it('Should use the status if the state is not present', () => {
        expect(normalizeContainerState({ Status: 'Up 2 minutes (Paused)' })).to.equal('paused');

        expect(normalizeContainerState({ Status: 'Up 2 minutes' })).to.equal('running');

        expect(normalizeContainerState({ Status: 'Exited (0) 2 minutes ago' })).to.equal('exited');
        expect(normalizeContainerState({ Status: 'Terminated (1) 2 minutes ago' })).to.equal('exited');
        expect(normalizeContainerState({ Status: 'Dead' })).to.equal('exited');

        expect(normalizeContainerState({ Status: 'Created' })).to.equal('created');
    });

    it('Should return state unknown if the status is unrecognized', () => {
        expect(normalizeContainerState({ Status: 'Foo' })).to.equal('unknown');
    });
});

describe('(unit) normalizeListContainerRecord', () => {
    it('Should normalize a Docker-style container record', () => {
        const parsed = SharedListContainerRecordSchema.parse({
            ID: 'abc123',
            Names: 'my-container',
            Image: 'alpine:latest',
            Ports: '0.0.0.0:8080->80/tcp',
            Networks: 'bridge',
            Labels: 'com.example.k=v',
            CreatedAt: '2024-06-01 12:00:00 +0000 UTC',
            State: 'running',
            Status: 'Up 2 minutes',
        });

        const result = normalizeListContainerRecord(parsed, true, DockerListContainerOptions);

        expect(result.id).to.equal('abc123');
        expect(result.name).to.equal('my-container');
        // Image was parsed into an ImageNameInfo by the shared imageNameSchema transform
        expect(result.image.originalName).to.equal('alpine:latest');
        expect(result.image.image).to.equal('alpine');
        expect(result.image.tag).to.equal('latest');
        expect(result.labels).to.deep.equal({ 'com.example.k': 'v' });
        expect(result.networks).to.deep.equal(['bridge']);
        expect(result.state).to.equal('running');
        expect(result.status).to.equal('Up 2 minutes');
        expect(result.ports).to.have.lengthOf(1);
        expect(result.ports[0].containerPort).to.equal(80);
    });

    it('Should take the first name when Names is comma-separated', () => {
        const parsed = SharedListContainerRecordSchema.parse({
            ID: 'abc123',
            Names: 'first,second',
            Image: 'alpine:latest',
        });

        const result = normalizeListContainerRecord(parsed, false, DockerListContainerOptions);

        expect(result.name).to.equal('first');
    });

    it('Should normalize compacted Docker port ranges in strict mode', () => {
        const parsed = SharedListContainerRecordSchema.parse({
            ID: 'abc123',
            Names: 'azurite',
            Image: 'mcr.microsoft.com/azure-storage/azurite',
            Ports: '0.0.0.0:10000-10002->10000-10002/tcp, [::]:10000-10002->10000-10002/tcp',
        });

        const result = normalizeListContainerRecord(parsed, true, DockerListContainerOptions);

        expect(result.ports).to.deep.equal([
            { hostIp: '0.0.0.0', hostPort: 10000, containerPort: 10000, protocol: 'tcp' },
            { hostIp: '0.0.0.0', hostPort: 10001, containerPort: 10001, protocol: 'tcp' },
            { hostIp: '0.0.0.0', hostPort: 10002, containerPort: 10002, protocol: 'tcp' },
            { hostIp: '::', hostPort: 10000, containerPort: 10000, protocol: 'tcp' },
            { hostIp: '::', hostPort: 10001, containerPort: 10001, protocol: 'tcp' },
            { hostIp: '::', hostPort: 10002, containerPort: 10002, protocol: 'tcp' },
        ]);
    });

    it('Should extract nerdctl networks from the nerdctl/networks label when Networks is absent', () => {
        const parsed = SharedListContainerRecordSchema.parse({
            ID: 'abc123',
            Names: 'my-container',
            Image: 'alpine:latest',
            Labels: 'nerdctl/networks=["bridge","custom-net"]',
            Status: 'Up 2 minutes',
        });

        const result = normalizeListContainerRecord(parsed, false, NerdctlListContainerOptions);

        expect(result.networks).to.deep.equal(['bridge', 'custom-net']);
        expect(result.state).to.equal('running');
    });

    it('Should throw on an unparseable port in Docker strict mode', () => {
        const parsed = SharedListContainerRecordSchema.parse({
            ID: 'abc123',
            Names: 'my-container',
            Image: 'alpine:latest',
            Ports: 'not-a-port',
        });

        expect(() => normalizeListContainerRecord(parsed, true, DockerListContainerOptions)).to.throw();
    });

    it('Should skip an unparseable port for nerdctl instead of throwing', () => {
        const parsed = SharedListContainerRecordSchema.parse({
            ID: 'abc123',
            Names: 'my-container',
            Image: 'alpine:latest',
            Ports: 'not-a-port',
            CreatedAt: '2024-06-01 12:00:00 +0000 UTC',
            Status: 'Up 2 minutes',
        });

        const result = normalizeListContainerRecord(parsed, true, NerdctlListContainerOptions);

        expect(result.ports).to.deep.equal([]);
    });
});
