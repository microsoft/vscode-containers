/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import * as crypto from 'crypto';
import { describe, it } from 'mocha';
import { ShellQuoting } from 'vscode';

import {
    DockerClient,
} from '../clients/DockerClient/DockerClient';
import { BuildImageCommandOptions, RunContainerCommandOptions } from '../contracts/ContainerClient';
import { escaped } from '../utils/commandLineBuilder';
import { Bash, Powershell } from '../utils/spawnStreamAsync';

describe('DockerClient', () => {
    const client = new DockerClient();

    describe('#listImagesAsync()', () => {
        it('parses date formats', async () => {
            const commandResult = await client.listImages({});
            const results = await commandResult.parse(
                [
                    '{"Containers":"N/A","CreatedAt":"2021-06-08 08:07:21 +0100 BST","CreatedSince":"17 months ago","Digest":"\u003cnone\u003e","ID":"someid","Repository":"some/repository","SharedSize":"N/A","Size":"1MB","Tag":"sometag","UniqueSize":"N/A","VirtualSize":"1MB"}',
                    '{"Containers":"N/A","CreatedAt":"2021-06-08 08:07:21.000Z","CreatedSince":"17 months ago","Digest":"\u003cnone\u003e","ID":"otherid","Repository":"some/repository","SharedSize":"N/A","Size":"1MB","Tag":"sometag","UniqueSize":"N/A","VirtualSize":"1MB"}',
                ].join('\n'),
                false,
            );

            expect(results).to.have.lengthOf(2);
            expect(results[0]).to.have.property('createdAt');
            expect(results[0].createdAt.getDay()).to.not.be.NaN;
            expect(results[1]).to.have.property('createdAt');
            expect(results[1].createdAt.getDay()).to.not.be.NaN;
        });
    });

    describe('#buildImageAsync()', () => {
        it('handles default values', async () => {
            const path = crypto.randomBytes(60).toString('utf8');

            const commandResult = await client.buildImage({
                path,
            });

            expect(commandResult).to.have.a.property('command', 'docker');
            expect(commandResult).to.have.a.property('args').that.deep.equals(
                [
                    escaped('image'),
                    escaped('build'),
                    { value: path, quoting: ShellQuoting.Strong },
                ]);
        });
        it('handles pull=true', async () => {
            const commandResult = await client.buildImage({
                path: '.',
                pull: true,
            });

            expect(commandResult).to.have.property('args').with.lengthOf(4);
        });
        it('handles pull=false', async () => {
            const commandResult = await client.buildImage({
                path: '.',
                pull: false,
            });

            expect(commandResult).to.have.property('args').with.lengthOf(3);
        });
        it('handles file', async () => {
            const file = crypto.randomBytes(60).toString('utf8');

            const commandResult = await client.buildImage({
                path: '.',
                file,
            });

            expect(commandResult).to.have.property('args').that.deep.equals([
                escaped('image'),
                escaped('build'),
                escaped('--file'),
                { value: file, quoting: ShellQuoting.Strong },
                { value: '.', quoting: ShellQuoting.Strong },
            ]);
        });
    });

    describe('#pruneContainersAsync()', () => {
        it('correctly parses output', async () => {
            const commandResult = await client.pruneContainers({});
            const results = await commandResult.parse(`Deleted Containers:
cdd20631c35b49696556d07df9a90421316d47eeac945c99ca800372bf9b8736
0626abaf0a27401e2e25169bee8a38157f5b6e8427f198615ad7f304c4cb6deb

Total reclaimed space: 14B`, true);

            expect(results.containersDeleted).to.have.lengthOf(2);
            expect(results.containersDeleted).to.contain('cdd20631c35b49696556d07df9a90421316d47eeac945c99ca800372bf9b8736');
            expect(results.containersDeleted).to.contain('0626abaf0a27401e2e25169bee8a38157f5b6e8427f198615ad7f304c4cb6deb');
            expect(results.spaceReclaimed).to.equal(14);
        });
    });

    describe('#pruneImagesAsync()', () => {
        it('correctly parses output', async () => {
            const commandResult = await client.pruneImages({});
            const results = await commandResult.parse(`Deleted Images:
untagged: redis@sha256:4ca2a277f1dc3ddd0da33a258096de9a1cf5b9d9bd96b27ee78763ee2248c28c
deleted: sha256:5b0542ad1e7734b17905e99f80defc1f0a7748dd6d6f1648949eb45583d087de
deleted: sha256:57ddb0b590e783cb033cd152d777e75ad20a2c85c7f85ea7c9f6de020ee30571
deleted: sha256:e933c69e3728b6c09699982b317493292aaaea4f3675a6a8465220a39a15bef7

Total reclaimed space: 62.95MB`, true);

            expect(results.imageRefsDeleted).to.have.lengthOf(3);
            expect(results.imageRefsDeleted).to.contain('5b0542ad1e7734b17905e99f80defc1f0a7748dd6d6f1648949eb45583d087de');
            expect(results.imageRefsDeleted).to.contain('57ddb0b590e783cb033cd152d777e75ad20a2c85c7f85ea7c9f6de020ee30571');
            expect(results.imageRefsDeleted).to.contain('e933c69e3728b6c09699982b317493292aaaea4f3675a6a8465220a39a15bef7');
            expect(results.spaceReclaimed).to.equal(Math.round(62.95 * 1024 * 1024));
        });
    });

    describe('#pruneVolumesAsync()', () => {
        it('correctly parses output', async () => {
            const commandResult = await client.pruneVolumes({});
            const results = await commandResult.parse(`Deleted Volumes:
d7d3cac120e9db519613f44866be1a1e39841a4841d678d632ba83775f318f49
foo

Total reclaimed space: 155.2KB`, true);

            expect(results.volumesDeleted).to.have.lengthOf(2);
            expect(results.volumesDeleted).to.contain('d7d3cac120e9db519613f44866be1a1e39841a4841d678d632ba83775f318f49');
            expect(results.volumesDeleted).to.contain('foo');
            expect(results.spaceReclaimed).to.equal(Math.round(155.2 * 1024));
        });
    });

    describe('#pruneNetworksAsync()', () => {
        it('correctly parses output', async () => {
            const commandResult = await client.pruneNetworks({});
            const results = await commandResult.parse(`Deleted Networks:
test_network1
test_network2`, true);

            expect(results.networksDeleted).to.have.lengthOf(2);
            expect(results.networksDeleted).to.contain('test_network1');
            expect(results.networksDeleted).to.contain('test_network2');
            expect(results).to.not.have.property('spaceReclaimed');
        });
    });
});

describe('DockerClient (unit)', () => {
    const client = new DockerClient();

    it('Should produce the expected lack of quoting/escaping customOptions', async () => {
        const options: BuildImageCommandOptions = {
            path: '.',
            customOptions: '--no-cache --progress plain'
        };

        const commandResponse = await client.buildImage(options);
        const pwshQuoted = new Powershell().quote(commandResponse.args);
        const bashQuoted = new Bash().quote(commandResponse.args);

        expect(pwshQuoted).to.deep.equal(['image', 'build', '--no-cache --progress plain', '\'.\'']);
        expect(bashQuoted).to.deep.equal(['image', 'build', '--no-cache --progress plain', '\'.\'']);
    });

    it('Should produce the expected lack of quoting/escaping a single string command', async () => {
        const options: RunContainerCommandOptions = {
            imageRef: 'someimage',
            command: 'sh -c "echo hello world"',
        };

        const commandResponse = await client.runContainer(options);
        const pwshQuoted = new Powershell().quote(commandResponse.args);
        const bashQuoted = new Bash().quote(commandResponse.args);

        expect(pwshQuoted).to.deep.equal(['container', 'run', 'someimage', 'sh -c "echo hello world"']);
        expect(bashQuoted).to.deep.equal(['container', 'run', 'someimage', 'sh -c "echo hello world"']);
    });

    it('Should produce the expected quoting/escaping of an array command', async () => {
        const options: RunContainerCommandOptions = {
            imageRef: 'someimage',
            command: ['sh', '-c', 'echo hello world'],
        };

        const commandResponse = await client.runContainer(options);
        const pwshQuoted = new Powershell().quote(commandResponse.args);
        const bashQuoted = new Bash().quote(commandResponse.args);

        expect(pwshQuoted).to.deep.equal(['container', 'run', 'someimage', 'sh', '-c', 'echo` hello` world']);
        expect(bashQuoted).to.deep.equal(['container', 'run', 'someimage', 'sh', '-c', 'echo\\ hello\\ world']);
    });
});
