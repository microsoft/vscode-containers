/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { expandDockerRawPortString } from '../../../clients/DockerClientBase/parseDockerRawPortString';
import type { PortBinding } from '../../../contracts/ContainerClient';

describe('(unit) expandDockerRawPortString', () => {
    const validCases: Array<{ input: string; expected: PortBinding[] }> = [
        {
            input: '1234/udp',
            expected: [{ containerPort: 1234, protocol: 'udp' }],
        },
        {
            input: '1234/sctp',
            expected: [{ containerPort: 1234, protocol: 'sctp' }],
        },
        {
            input: '0.0.0.0:1234-> 5678/tcp',
            expected: [{ hostIp: '0.0.0.0', hostPort: 1234, containerPort: 5678, protocol: 'tcp' }],
        },
        {
            input: '[1234:abcd::0]:2345-> 5678/tcp',
            expected: [{ hostIp: '1234:abcd::0', hostPort: 2345, containerPort: 5678, protocol: 'tcp' }],
        },
        {
            input: '8080->80/tcp',
            expected: [{ hostPort: 8080, containerPort: 80, protocol: 'tcp' }],
        },
        {
            input: '0.0.0.0:3000->3000',
            expected: [{ hostIp: '0.0.0.0', hostPort: 3000, containerPort: 3000, protocol: 'tcp' }],
        },
        {
            // Docker's IPv6 unspecified-address wildcard form (no brackets)
            input: ':::8080->80/tcp',
            expected: [{ hostIp: '::', hostPort: 8080, containerPort: 80, protocol: 'tcp' }],
        },
        {
            // Docker's IPv6 wildcard, bracketed form
            input: '[::]:8080->80/tcp',
            expected: [{ hostIp: '::', hostPort: 8080, containerPort: 80, protocol: 'tcp' }],
        },
        {
            // Bare (unbracketed) IPv6 host with embedded colons
            input: '::1:8080->80/tcp',
            expected: [{ hostIp: '::1', hostPort: 8080, containerPort: 80, protocol: 'tcp' }],
        },
    ];

    validCases.forEach(({ input, expected }) => {
        it(`Should parse "${input}"`, () => {
            expect(expandDockerRawPortString(input)).to.deep.equal(expected);
        });
    });

    const invalidCases = [
        '',
        '1234',
        '1234/abc',
        '0.0.0.0:1234-> 5678/abc',
        '0.0.0.0->5678/tcp',
        '[::1]->5678/tcp',
        '8080->',
    ];

    invalidCases.forEach((input) => {
        it(`Should return undefined for invalid format "${input}"`, () => {
            expect(expandDockerRawPortString(input)).to.be.undefined;
        });
    });

    it('Should expand short-form port ranges', () => {
        expect(expandDockerRawPortString('10000-10002/tcp')).to.deep.equal([
            { containerPort: 10000, protocol: 'tcp' },
            { containerPort: 10001, protocol: 'tcp' },
            { containerPort: 10002, protocol: 'tcp' },
        ]);
    });

    it('Should expand long-form port ranges', () => {
        expect(expandDockerRawPortString('0.0.0.0:32768-32770->8000-8002/tcp')).to.deep.equal([
            { hostIp: '0.0.0.0', hostPort: 32768, containerPort: 8000, protocol: 'tcp' },
            { hostIp: '0.0.0.0', hostPort: 32769, containerPort: 8001, protocol: 'tcp' },
            { hostIp: '0.0.0.0', hostPort: 32770, containerPort: 8002, protocol: 'tcp' },
        ]);
        expect(expandDockerRawPortString('0.0.0.0:100-102-> 100-102/tcp')).to.deep.equal([
            { hostIp: '0.0.0.0', hostPort: 100, containerPort: 100, protocol: 'tcp' },
            { hostIp: '0.0.0.0', hostPort: 101, containerPort: 101, protocol: 'tcp' },
            { hostIp: '0.0.0.0', hostPort: 102, containerPort: 102, protocol: 'tcp' },
        ]);
        expect(expandDockerRawPortString('100-101->100-101/tcp')).to.deep.equal([
            { hostPort: 100, containerPort: 100, protocol: 'tcp' },
            { hostPort: 101, containerPort: 101, protocol: 'tcp' },
        ]);
        expect(expandDockerRawPortString(':::10000-10001->10000-10001/udp')).to.deep.equal([
            { hostIp: '::', hostPort: 10000, containerPort: 10000, protocol: 'udp' },
            { hostIp: '::', hostPort: 10001, containerPort: 10001, protocol: 'udp' },
        ]);
        expect(expandDockerRawPortString('[::]:10000-10002->10000-10002/sctp')).to.deep.equal([
            { hostIp: '::', hostPort: 10000, containerPort: 10000, protocol: 'sctp' },
            { hostIp: '::', hostPort: 10001, containerPort: 10001, protocol: 'sctp' },
            { hostIp: '::', hostPort: 10002, containerPort: 10002, protocol: 'sctp' },
        ]);
    });

    it('Should expand a single-port range', () => {
        expect(expandDockerRawPortString('10000-10000/tcp')).to.deep.equal([
            { containerPort: 10000, protocol: 'tcp' },
        ]);
        expect(expandDockerRawPortString('[::]:10000-10000->10000-10000/tcp')).to.deep.equal([
            { hostIp: '::', hostPort: 10000, containerPort: 10000, protocol: 'tcp' },
        ]);
    });

    it('Should reject invalid port ranges', () => {
        expect(expandDockerRawPortString('10002-10000/tcp')).to.be.undefined;
        expect(expandDockerRawPortString('10000-10001->10000-10002/tcp')).to.be.undefined;
        expect(expandDockerRawPortString('1-999999999999/tcp')).to.be.undefined;
        expect(expandDockerRawPortString('1-999999999999->1-999999999999/tcp')).to.be.undefined;
        expect(expandDockerRawPortString('65535-65536/tcp')).to.be.undefined;
    });
});
