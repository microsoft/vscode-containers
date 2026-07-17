/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { parseDockerRawPortString } from '../clients/DockerClientBase/parseDockerRawPortString';
import type { PortBinding } from '../contracts/ContainerClient';

describe('(unit) parseDockerRawPortString', () => {
    const validCases: Array<{ input: string; expected: PortBinding }> = [
        {
            input: '1234/udp',
            expected: { containerPort: 1234, protocol: 'udp' },
        },
        {
            input: '0.0.0.0:1234-> 5678/tcp',
            expected: { hostIp: '0.0.0.0', hostPort: 1234, containerPort: 5678, protocol: 'tcp' },
        },
        {
            input: '[1234:abcd::0]:2345-> 5678/tcp',
            expected: { hostIp: '1234:abcd::0', hostPort: 2345, containerPort: 5678, protocol: 'tcp' },
        },
        {
            input: '8080->80/tcp',
            expected: { hostPort: 8080, containerPort: 80, protocol: 'tcp' },
        },
        {
            input: '0.0.0.0:3000->3000',
            expected: { hostIp: '0.0.0.0', hostPort: 3000, containerPort: 3000, protocol: 'tcp' },
        },
        {
            // Docker's IPv6 unspecified-address wildcard form (no brackets)
            input: ':::8080->80/tcp',
            expected: { hostIp: '::', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
        },
        {
            // Docker's IPv6 wildcard, bracketed form
            input: '[::]:8080->80/tcp',
            expected: { hostIp: '::', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
        },
        {
            // Bare (unbracketed) IPv6 host with embedded colons
            input: '::1:8080->80/tcp',
            expected: { hostIp: '::1', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
        },
    ];

    validCases.forEach(({ input, expected }) => {
        it(`Should parse "${input}"`, () => {
            expect(parseDockerRawPortString(input)).to.deep.equal(expected);
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
            expect(parseDockerRawPortString(input)).to.be.undefined;
        });
    });
});
