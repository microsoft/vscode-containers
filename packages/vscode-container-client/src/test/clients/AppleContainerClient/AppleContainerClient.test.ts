/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type CommandLineArgs, NoShell } from '@microsoft/vscode-processutils';
import { expect } from 'chai';
import { describe, it } from 'mocha';

import { AppleContainerClient } from '../../../clients/AppleContainerClient/AppleContainerClient';
import { CommandNotSupportedError } from '../../../utils/CommandNotSupportedError';

// NoShell(false).quote() returns the raw, unquoted arg values (platform-independent), which is what
// these arg-shape assertions compare against.
const noShell = new NoShell(false);
function asStrings(args: CommandLineArgs): string[] {
    return noShell.quote(args);
}

async function expectRejection(promiseOrFn: Promise<unknown> | (() => Promise<unknown>)): Promise<void> {
    let caught: unknown;
    try {
        const promise = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
        await promise;
    } catch (err) {
        caught = err;
    }
    expect(caught).to.be.instanceOf(CommandNotSupportedError);
}

// Fixtures below are trimmed from real `container` CLI 1.2.0 output captured on real Apple
// Silicon hardware (see apple-container-poc-plan.md at the repo root), not hand-guessed shapes.

const alpineImageListRecord = {
    id: '28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b',
    configuration: {
        creationDate: '2026-06-16T00:00:15Z',
        descriptor: { digest: 'sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b', mediaType: 'application/vnd.oci.image.index.v1+json', size: 9218 },
        name: 'docker.io/library/alpine:latest',
    },
    variants: [
        { digest: 'sha256:e7a1a92a5bfeee40966aea60f0796b0e7917cc35591542701834f03a68fa3d18', platform: { architecture: 'arm64', os: 'linux', variant: 'v8' }, size: 4184689 },
        { digest: 'sha256:d9dc32c63a23ac682a41ab2eae01051d2a4fbe472eefd109faf97be63a5216e5', platform: { architecture: 'unknown', os: 'unknown' }, size: 86390 },
    ],
};

const alpineImageInspectRecord = {
    id: '28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b',
    configuration: {
        creationDate: '2026-06-16T00:00:15Z',
        descriptor: { digest: 'sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b', mediaType: 'application/vnd.oci.image.index.v1+json', size: 9218 },
        name: 'docker.io/library/alpine:latest',
    },
    variants: [
        {
            digest: 'sha256:e7a1a92a5bfeee40966aea60f0796b0e7917cc35591542701834f03a68fa3d18',
            platform: { architecture: 'arm64', os: 'linux', variant: 'v8' },
            size: 4184689,
            config: { config: { Cmd: ['/bin/sh'], Env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'], WorkingDir: '/' } },
        },
        {
            digest: 'sha256:d9dc32c63a23ac682a41ab2eae01051d2a4fbe472eefd109faf97be63a5216e5',
            platform: { architecture: 'unknown', os: 'unknown' },
            size: 86390,
            config: { config: {} },
        },
    ],
};

const pocContainerListRecord = {
    id: 'poc-test',
    configuration: {
        creationDate: '2026-08-04T18:09:35Z',
        image: { descriptor: { digest: 'sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b', mediaType: 'application/vnd.oci.image.index.v1+json', size: 9218 }, reference: 'docker.io/library/alpine:latest' },
        labels: {},
        networks: [{ network: 'default', options: { hostname: 'poc-test', mtu: 1280 } }],
    },
    status: {
        networks: [{ hostname: 'poc-test', ipv4Address: '192.168.65.2/24', ipv4Gateway: '192.168.65.1', macAddress: 'fa:84:d6:66:7f:af', mtu: 1280, network: 'default', variant: 'reserved' }],
        startedDate: '2026-08-04T18:09:37Z',
        state: 'running',
    },
};

const pocContainerInspectRecord = {
    ...pocContainerListRecord,
    configuration: {
        ...pocContainerListRecord.configuration,
        initProcess: {
            arguments: ['300'],
            environment: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'],
            executable: 'sleep',
            workingDirectory: '/',
        },
    },
};

describe('(unit) AppleContainerClient', () => {
    const client = new AppleContainerClient();

    it('Has the expected ClientId and default command', () => {
        expect(AppleContainerClient.ClientId).to.equal('com.microsoft.visualstudio.containers.applecontainer');
        expect(client.id).to.equal('com.microsoft.visualstudio.containers.applecontainer');
        expect(client.commandName).to.equal('container');
        expect(client.displayName).to.equal('Container');
    });

    describe('#checkInstall()', () => {
        it('Produces `--version` args (no `-v` shorthand; confirmed unsupported)', async () => {
            const response = await client.checkInstall({});
            expect(asStrings(response.args)).to.deep.equal(['--version']);
        });
    });

    describe('#version()', () => {
        it('Produces `--version` args (no top-level `version` subcommand)', async () => {
            const response = await client.version({});
            expect(asStrings(response.args)).to.deep.equal(['--version']);
        });

        it('Parses "container CLI version 1.2.0 (build: release, commit: 6e65319)"', async () => {
            const response = await client.version({});
            const parsed = await response.parse('container CLI version 1.2.0 (build: release, commit: 6e65319)\n', true);
            expect(parsed).to.have.property('client', '1.2.0');
            expect(parsed).to.have.property('server', undefined);
        });
    });

    describe('#info()', () => {
        it('Synthesizes a linux InfoItem because container has no info command', async () => {
            const response = await client.info({});
            const item = await response.parse('whatever', false);
            expect(item).to.have.property('osType', 'linux');
        });
    });

    describe('Unsupported commands', () => {
        it('getEventStream rejects with CommandNotSupportedError', async () => {
            await expectRejection(client.getEventStream({}));
        });

        it('restartContainers rejects with CommandNotSupportedError', async () => {
            await expectRejection(client.restartContainers({ container: ['abc'] }));
        });
    });

    describe('#pullImage()', () => {
        it('Pins --arch arm64 to avoid the default multi-platform fetch', async () => {
            const response = await client.pullImage({ imageRef: 'alpine:latest' });
            expect(asStrings(response.args)).to.deep.equal(['image', 'pull', '--arch', 'arm64', 'alpine:latest']);
        });

        it('Throws when allTags is set', async () => {
            await expectRejection(() => client.pullImage({ imageRef: 'alpine', allTags: true }));
        });

        it('Throws when disableContentTrust is set', async () => {
            await expectRejection(() => client.pullImage({ imageRef: 'alpine', disableContentTrust: false }));
        });
    });

    describe('#listImages()', () => {
        it('Produces `image list --format json` args with no --filter flags', async () => {
            const response = await client.listImages({ dangling: true, labels: { foo: 'bar' } });
            expect(asStrings(response.args)).to.deep.equal(['image', 'list', '--format', 'json']);
        });

        it('Parses the manifest-list shape, using configuration.name (not configuration.descriptor.name)', async () => {
            const response = await client.listImages({});
            const items = await response.parse(JSON.stringify([alpineImageListRecord]), true);
            expect(items).to.have.lengthOf(1);
            expect(items[0].image.originalName).to.equal('docker.io/library/alpine:latest');
            expect(items[0].image.tag).to.equal('latest');
            // id must be the reference, not the digest -- see AppleContainerListImageRecord.ts for why.
            expect(items[0].id).to.equal('docker.io/library/alpine:latest');
        });

        it('Excludes the "unknown" attestation variant from the size sum', async () => {
            const response = await client.listImages({});
            const items = await response.parse(JSON.stringify([alpineImageListRecord]), true);
            // Only the real arm64 variant's size (4184689) counts; the 86390-byte "unknown" blob is excluded.
            expect(items[0].size).to.equal(4184689);
        });

        it('Falls back to the digest for an unnamed image', async () => {
            const response = await client.listImages({});
            const unnamed = { ...alpineImageListRecord, configuration: { ...alpineImageListRecord.configuration, name: undefined } };
            const items = await response.parse(JSON.stringify([unnamed]), true);
            expect(items[0].id).to.equal(alpineImageListRecord.id);
        });

        it('Filters by reference client-side', async () => {
            const response = await client.listImages({ references: ['docker.io/library/alpine'] });
            const items = await response.parse(JSON.stringify([alpineImageListRecord]), true);
            expect(items).to.have.lengthOf(1);
        });

        it('Excludes non-matching references client-side', async () => {
            const response = await client.listImages({ references: ['docker.io/library/busybox'] });
            const items = await response.parse(JSON.stringify([alpineImageListRecord]), true);
            expect(items).to.have.lengthOf(0);
        });
    });

    describe('#inspectImages()', () => {
        it('Produces `image inspect <ref>` args with no --format flag (confirmed unsupported)', async () => {
            const response = await client.inspectImages({ imageRefs: ['docker.io/library/alpine:latest'] });
            expect(asStrings(response.args)).to.deep.equal(['image', 'inspect', 'docker.io/library/alpine:latest']);
        });

        it('Selects the arm64/linux variant and reads its OCI config', async () => {
            const response = await client.inspectImages({ imageRefs: ['docker.io/library/alpine:latest'] });
            const items = await response.parse(JSON.stringify([alpineImageInspectRecord]), true);
            expect(items).to.have.lengthOf(1);
            expect(items[0]).to.include({ architecture: 'arm64', operatingSystem: 'linux', currentDirectory: '/' });
            expect(items[0].command).to.deep.equal(['/bin/sh']);
            expect(items[0].environmentVariables).to.deep.equal({ PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' });
            // id must be the reference, not the digest -- see AppleContainerInspectImageRecord.ts.
            expect(items[0].id).to.equal('docker.io/library/alpine:latest');
        });
    });

    describe('#runContainer()', () => {
        it('Emits supported flags with bare `run` (not `container run`)', async () => {
            const response = await client.runContainer({
                imageRef: 'alpine:latest',
                name: 'demo',
                detached: true,
                removeOnExit: true,
                network: 'mynet',
                ports: [{ hostPort: 8080, containerPort: 80, protocol: 'tcp' }],
                labels: { env: 'dev' },
                environmentVariables: { FOO: 'bar' },
                entrypoint: '/bin/sh',
            });
            const args = asStrings(response.args);
            expect(args[0]).to.equal('run');
            expect(args).to.not.include('container');
            expect(args).to.include('--detach');
            expect(args).to.include('--rm');
            expect(args).to.include('--name');
            expect(args).to.include('demo');
            expect(args).to.include('--network');
            expect(args).to.include('mynet');
            expect(args).to.include('--publish');
            expect(args).to.include('--label');
            expect(args).to.include('env=dev');
            expect(args).to.include('--env');
            expect(args).to.include('FOO=bar');
            expect(args).to.include('--entrypoint');
            expect(args).to.include('/bin/sh');
            expect(args).to.include('alpine:latest');
        });

        it('Emits --mount with target= (not destination=)', async () => {
            const response = await client.runContainer({
                imageRef: 'alpine:latest',
                mounts: [{ type: 'bind', source: '/host/src', destination: '/src', readOnly: true }],
            });
            const args = asStrings(response.args);
            expect(args).to.include('--mount');
            expect(args).to.include('type=bind,source=/host/src,target=/src,readonly');
            expect(args).to.not.include('destination=/src');
        });

        it('Throws when publishAllPorts is set', async () => {
            await expectRejection(() => client.runContainer({ imageRef: 'alpine:latest', publishAllPorts: true }));
        });

        it('Throws when networkAlias is set', async () => {
            await expectRejection(() => client.runContainer({ imageRef: 'alpine:latest', networkAlias: 'alias' }));
        });

        it('Throws when addHost has entries', async () => {
            await expectRejection(() => client.runContainer({
                imageRef: 'alpine:latest',
                addHost: [{ hostname: 'foo.local', ip: '127.0.0.1' }],
            }));
        });

        it('Throws when exposePorts has entries', async () => {
            await expectRejection(() => client.runContainer({ imageRef: 'alpine:latest', exposePorts: [3000] }));
        });
    });

    describe('#listContainers()', () => {
        it('Produces `list --format json` args with no --filter flags', async () => {
            const response = await client.listContainers({ labels: { foo: 'bar' }, names: ['x'] });
            expect(asStrings(response.args)).to.deep.equal(['list', '--format', 'json']);
        });

        it('Passes --all when `all` or `exited` is requested', async () => {
            expect(asStrings((await client.listContainers({ all: true })).args)).to.include('--all');
            expect(asStrings((await client.listContainers({ exited: true })).args)).to.include('--all');
            expect(asStrings((await client.listContainers({})).args)).to.not.include('--all');
        });

        it('Parses the nested list shape', async () => {
            const response = await client.listContainers({});
            const items = await response.parse(JSON.stringify([pocContainerListRecord]), true);
            expect(items).to.have.lengthOf(1);
            expect(items[0]).to.include({ id: 'poc-test', name: 'poc-test', state: 'running' });
            expect(items[0].image.originalName).to.equal('docker.io/library/alpine:latest');
            expect(items[0].networks).to.deep.equal(['default']);
        });

        it('Filters by running/exited state client-side', async () => {
            const response = await client.listContainers({ exited: true });
            const items = await response.parse(JSON.stringify([pocContainerListRecord]), true);
            // The fixture container is 'running'; requesting only exited containers excludes it.
            expect(items).to.have.lengthOf(0);
        });

        it('Filters by name client-side', async () => {
            const response = await client.listContainers({ names: ['not-poc-test'] });
            const items = await response.parse(JSON.stringify([pocContainerListRecord]), true);
            expect(items).to.have.lengthOf(0);
        });

        it('Filters by labels client-side', async () => {
            const withLabel = { ...pocContainerListRecord, configuration: { ...pocContainerListRecord.configuration, labels: { keep: 'yes' } } };
            const response = await client.listContainers({ labels: { keep: 'yes' } });
            const items = await response.parse(JSON.stringify([withLabel]), true);
            expect(items).to.have.lengthOf(1);
            const response2 = await client.listContainers({ labels: { keep: 'no' } });
            const items2 = await response2.parse(JSON.stringify([withLabel]), true);
            expect(items2).to.have.lengthOf(0);
        });
    });

    describe('#stopContainers()', () => {
        it('Produces bare `stop` args (not `container stop`)', async () => {
            const response = await client.stopContainers({ container: ['abc'], time: 10 });
            expect(asStrings(response.args)).to.deep.equal(['stop', '--time', '10', 'abc']);
        });
    });

    describe('#removeContainers()', () => {
        it('Produces `delete` args (not `container rm`)', async () => {
            const response = await client.removeContainers({ containers: ['abc'], force: true });
            expect(asStrings(response.args)).to.deep.equal(['delete', '--force', 'abc']);
        });
    });

    describe('#inspectContainers()', () => {
        it('Produces bare `inspect` args with no --format flag (confirmed unsupported)', async () => {
            const response = await client.inspectContainers({ containers: ['poc-test'] });
            expect(asStrings(response.args)).to.deep.equal(['inspect', 'poc-test']);
        });

        it('Parses the nested inspect shape, including the resolved init process as command', async () => {
            const response = await client.inspectContainers({ containers: ['poc-test'] });
            const items = await response.parse(JSON.stringify([pocContainerInspectRecord]), true);
            expect(items).to.have.lengthOf(1);
            expect(items[0]).to.include({ id: 'poc-test', name: 'poc-test', currentDirectory: '/' });
            expect(items[0].command).to.deep.equal(['sleep', '300']);
            expect(items[0].environmentVariables).to.deep.equal({ PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' });
            expect(items[0].networks).to.have.lengthOf(1);
            expect(items[0].networks[0]).to.include({ name: 'default', ipAddress: '192.168.65.2/24' });
            // imageId strips the sha256: prefix.
            expect(items[0].imageId).to.equal('28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b');
        });
    });
});
