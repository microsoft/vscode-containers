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
// Silicon hardware, not hand-guessed shapes.

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

// Captured from a real `container run -d --mount type=volume,source=poc-vol,destination=/data
// -p 8080:80 alpine:3.19 sleep 300` (CLI 1.2.0).
const mountedPublishedContainerRecord = {
    id: 'poc-mount-test2',
    configuration: {
        creationDate: '2026-08-06T04:39:50Z',
        image: {
            descriptor: { digest: 'sha256:6baf43584bcb78f2e5847d1de515f23499913ac9f12bdf834811a3145eb11ca1', mediaType: 'application/vnd.oci.image.index.v1+json', size: 8077 },
            reference: 'docker.io/library/alpine:3.19',
        },
        initProcess: {
            arguments: ['300'],
            environment: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'],
            executable: 'sleep',
            workingDirectory: '/',
        },
        labels: {},
        mounts: [
            {
                destination: '/data',
                options: [],
                source: '/Users/victorpuga/Library/Application Support/com.apple.container/volumes/poc-vol/volume.img',
                type: { volume: { name: 'poc-vol' } },
            },
        ],
        networks: [{ network: 'default', options: { hostname: 'poc-mount-test2', mtu: 1280 } }],
        publishedPorts: [{ containerPort: 80, count: 1, hostAddress: '0.0.0.0', hostPort: 8080, proto: 'tcp' }],
    },
    status: {
        networks: [],
        startedDate: '2026-08-06T04:39:51Z',
        state: 'running',
    },
};

// Captured from a real `container run -d --mount type=bind,source=$PWD/bindhost,
// destination=/hostdata,readonly alpine:3.19 sleep 300`.
const readonlyBindMount = {
    destination: '/hostdata',
    options: ['ro'],
    source: '/Users/victorpuga/bindhost',
    type: { virtiofs: {} },
};

// Captured from a real `container run -d -p 9090:80 -p 127.0.0.1:9091:81/udp ...`.
const multiPublishedPorts = [
    { containerPort: 80, count: 1, hostAddress: '0.0.0.0', hostPort: 9090, proto: 'tcp' },
    { containerPort: 81, count: 1, hostAddress: '127.0.0.1', hostPort: 9091, proto: 'udp' },
];

const alpineVolumeListRecord = {
    id: 'poc-vol',
    configuration: {
        creationDate: '2026-08-06T04:39:04Z',
        driver: 'local',
        format: 'ext4',
        labels: {},
        name: 'poc-vol',
        options: {},
        sizeInBytes: 549755813888,
        source: '/Users/victorpuga/Library/Application Support/com.apple.container/volumes/poc-vol/volume.img',
    },
};

const defaultNetworkListRecord = {
    id: 'default',
    configuration: {
        creationDate: '2026-08-06T04:38:28Z',
        labels: { 'com.apple.container.resource.role': 'builtin' },
        mode: 'nat',
        name: 'default',
        options: {},
        plugin: 'container-network-vmnet',
    },
    status: { ipv4Gateway: '192.168.64.1', ipv4Subnet: '192.168.64.0/24', ipv6Subnet: 'fd57:9cd7:94e6:49e0::/64' },
};

const internalNetworkListRecord = {
    id: 'poc-net-internal',
    configuration: {
        creationDate: '2026-08-06T04:47:15Z',
        labels: {},
        mode: 'hostOnly',
        name: 'poc-net-internal',
        options: {},
        plugin: 'container-network-vmnet',
    },
    status: { ipv4Gateway: '192.168.128.1', ipv4Subnet: '192.168.128.0/24', ipv6Subnet: 'fdb1:d6d8:6480:99dd::/64' },
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

    describe('#login()/#logout()', () => {
        it('Produces `registry login` args (not top-level `login`, which does not exist)', async () => {
            const response = await client.login({ registry: 'ghcr.io', username: 'me', passwordStdIn: true });
            expect(asStrings(response.args)).to.deep.equal(['registry', 'login', '--username', 'me', '--password-stdin', 'ghcr.io']);
        });

        it('Produces `registry logout` args (not top-level `logout`)', async () => {
            const response = await client.logout({ registry: 'ghcr.io' });
            expect(asStrings(response.args)).to.deep.equal(['registry', 'logout', 'ghcr.io']);
        });
    });

    describe('#buildImage()', () => {
        it('Produces bare `build` args (not `image build`), dropping --iidfile/--disable-content-trust', async () => {
            const response = await client.buildImage({
                path: '.',
                file: 'Dockerfile',
                stage: 'final',
                tags: 'alpine:latest',
                pull: true,
                labels: { foo: 'bar' },
                platform: { os: 'linux', architecture: 'arm64' },
                args: { KEY: 'value' },
                disableContentTrust: false,
                imageIdFile: '/tmp/iid',
            });
            expect(asStrings(response.args)).to.deep.equal([
                'build',
                '--pull',
                '--file', 'Dockerfile',
                '--target', 'final',
                '--tag', 'alpine:latest',
                '--label', 'foo=bar',
                '--platform', 'linux/arm64',
                '--build-arg', 'KEY=value',
                '.',
            ]);
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

    describe('#pruneImages()', () => {
        it('Produces `image prune` args without --force (confirmed unsupported)', async () => {
            const response = await client.pruneImages({});
            expect(asStrings(response.args)).to.deep.equal(['image', 'prune']);
        });

        it('Includes --all when requested', async () => {
            const response = await client.pruneImages({ all: true });
            expect(asStrings(response.args)).to.include('--all');
        });

        it('Parses "Reclaimed X in disk space" + "deleted <digest>" lines (real 1.2.0 output)', async () => {
            const response = await client.pruneImages({});
            const output = 'Reclaimed 81.2 MB in disk space\n'
                + 'deleted 65d86f451d12fb1de9db57a9226a899d80a0897cf0f1645faa565be3a268e621\n'
                + 'deleted 3be987e6cde1d07e873c012bf6cfe941e6e85d16ca5fc5b8bedc675451d2de67\n';
            const result = await response.parse(output, true);
            expect(result.imageRefsDeleted).to.deep.equal([
                '65d86f451d12fb1de9db57a9226a899d80a0897cf0f1645faa565be3a268e621',
                '3be987e6cde1d07e873c012bf6cfe941e6e85d16ca5fc5b8bedc675451d2de67',
            ]);
            expect(result.spaceReclaimed).to.equal(Math.round(81.2 * 1024 * 1024));
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

        it('Emits --mount with destination= (confirmed accepted by the real CLI)', async () => {
            const response = await client.runContainer({
                imageRef: 'alpine:latest',
                mounts: [{ type: 'bind', source: '/host/src', destination: '/src', readOnly: true }],
            });
            const args = asStrings(response.args);
            expect(args).to.include('--mount');
            expect(args).to.include('type=bind,source=/host/src,destination=/src,readonly');
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

    describe('#execContainer()', () => {
        it('Produces bare `exec` args (not `container exec`)', async () => {
            const response = await client.execContainer({ container: 'abc', command: ['echo', 'hi'] });
            expect(response.command).to.equal('container');
            expect(asStrings(response.args)).to.deep.equal(['exec', 'abc', 'echo', 'hi']);
        });

        it('Emits -i/-t/-d/--env flags matching Apple\'s own naming', async () => {
            const response = await client.execContainer({
                container: 'abc',
                interactive: true,
                detached: true,
                tty: true,
                environmentVariables: { FOO: 'bar' },
                command: ['sh'],
            });
            const args = asStrings(response.args);
            expect(args).to.include('--interactive');
            expect(args).to.include('--detach');
            expect(args).to.include('--tty');
            expect(args).to.include('--env');
            expect(args).to.include('FOO=bar');
        });
    });

    describe('#logsForContainer()', () => {
        it('Produces bare `logs` args (not `container logs`)', async () => {
            const response = await client.logsForContainer({ container: 'abc' });
            expect(asStrings(response.args)).to.deep.equal(['logs', 'abc']);
        });

        it('Maps `tail` to `-n` (not `--tail`)', async () => {
            const response = await client.logsForContainer({ container: 'abc', tail: 10 });
            expect(asStrings(response.args)).to.deep.equal(['logs', '-n', '10', 'abc']);
        });

        it('Emits --follow when requested', async () => {
            const response = await client.logsForContainer({ container: 'abc', follow: true });
            expect(asStrings(response.args)).to.include('--follow');
        });

        it('Throws when timestamps is requested (confirmed unsupported)', async () => {
            await expectRejection(() => client.logsForContainer({ container: 'abc', timestamps: true }));
        });

        it('Throws when since is requested (confirmed unsupported)', async () => {
            await expectRejection(() => client.logsForContainer({ container: 'abc', since: '10m' }));
        });

        it('Throws when until is requested (confirmed unsupported)', async () => {
            await expectRejection(() => client.logsForContainer({ container: 'abc', until: '1m' }));
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

        it("Maps `status.state: 'stopped'` to Docker's 'exited' (not passed through as-is)", async () => {
            // container's own vocabulary is just 'running'/'stopped' (confirmed for a stopped-after-
            // running container AND a created-but-never-started one -- there's no separate "created"
            // state). Passing 'stopped' through unmapped landed in getContainerStateIcon's `default:`
            // arm, which renders the *running* icon -- see ContainerProperties.ts. Regression coverage
            // for that bug: 'stopped' must become 'exited', a state getContainerStateIcon recognizes.
            const stopped = { ...pocContainerListRecord, status: { ...pocContainerListRecord.status, state: 'stopped', networks: [] } };
            const response = await client.listContainers({ all: true });
            const items = await response.parse(JSON.stringify([stopped]), true);
            expect(items[0].state).to.equal('exited');
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

    describe('#startContainers()', () => {
        it('Produces bare `start <id>` args (not `container start`)', async () => {
            const response = await client.startContainers({ container: ['abc'] });
            expect(asStrings(response.args)).to.deep.equal(['start', 'abc']);
        });

        it('Throws when more than one container is requested (confirmed CLI limitation)', async () => {
            await expectRejection(() => client.startContainers({ container: ['abc', 'def'] }));
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

    describe('#pruneContainers()', () => {
        it('Produces `prune` args without --force (confirmed unsupported; also drops the base\'s wrong `container prune` noun)', async () => {
            const response = await client.pruneContainers({});
            expect(asStrings(response.args)).to.deep.equal(['prune']);
        });

        it('Parses "Reclaimed X in disk space" + one hyphenated name per line (real 1.2.0 output)', async () => {
            const response = await client.pruneContainers({});
            const output = 'Reclaimed 4.12 GB in disk space\npoc-bind-test\nprune-container-test\npoc-mount-test2\n';
            const result = await response.parse(output, true);
            expect(result.containersDeleted).to.deep.equal(['poc-bind-test', 'prune-container-test', 'poc-mount-test2']);
            expect(result.spaceReclaimed).to.equal(Math.round(4.12 * 1024 * 1024 * 1024));
        });
    });

    describe('#statsContainers()', () => {
        it('Produces bare `stats` args without --all (confirmed unsupported; also drops the base\'s wrong `container stats` noun)', async () => {
            const response = await client.statsContainers({ all: true });
            expect(asStrings(response.args)).to.deep.equal(['stats']);
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
            // imageId keeps the sha256: prefix (matches SharedInspectContainerRecord's form).
            expect(items[0].imageId).to.equal('sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b');
        });

        it('Parses published ports (from configuration.publishedPorts)', async () => {
            const response = await client.inspectContainers({ containers: ['poc-mount-test2'] });
            const items = await response.parse(JSON.stringify([mountedPublishedContainerRecord]), true);
            expect(items[0].ports).to.deep.equal([{ containerPort: 80, hostPort: 8080, hostIp: '0.0.0.0', protocol: 'tcp' }]);
        });

        it('Expands a port range (`count` > 1) into `count` individual bindings', async () => {
            const ranged = { ...mountedPublishedContainerRecord, configuration: { ...mountedPublishedContainerRecord.configuration, publishedPorts: [{ containerPort: 80, count: 3, hostAddress: '0.0.0.0', hostPort: 9090, proto: 'tcp' }] } };
            const response = await client.inspectContainers({ containers: ['poc-mount-test2'] });
            const items = await response.parse(JSON.stringify([ranged]), true);
            expect(items[0].ports).to.deep.equal([
                { containerPort: 80, hostPort: 9090, hostIp: '0.0.0.0', protocol: 'tcp' },
                { containerPort: 81, hostPort: 9091, hostIp: '0.0.0.0', protocol: 'tcp' },
                { containerPort: 82, hostPort: 9092, hostIp: '0.0.0.0', protocol: 'tcp' },
            ]);
        });

        it('Parses a udp port with a specific host IP', async () => {
            const withUdp = { ...mountedPublishedContainerRecord, configuration: { ...mountedPublishedContainerRecord.configuration, publishedPorts: multiPublishedPorts } };
            const response = await client.inspectContainers({ containers: ['poc-mount-test2'] });
            const items = await response.parse(JSON.stringify([withUdp]), true);
            expect(items[0].ports).to.deep.equal([
                { containerPort: 80, hostPort: 9090, hostIp: '0.0.0.0', protocol: 'tcp' },
                { containerPort: 81, hostPort: 9091, hostIp: '127.0.0.1', protocol: 'udp' },
            ]);
        });

        it('Parses a volume mount, using the volume name (not the backing file path) as source', async () => {
            const response = await client.inspectContainers({ containers: ['poc-mount-test2'] });
            const items = await response.parse(JSON.stringify([mountedPublishedContainerRecord]), true);
            expect(items[0].mounts).to.deep.equal([{ type: 'volume', source: 'poc-vol', destination: '/data', readOnly: false }]);
        });

        it('Parses a readonly bind mount, reading readOnly from `options` (not a dedicated field)', async () => {
            const withBind = { ...mountedPublishedContainerRecord, configuration: { ...mountedPublishedContainerRecord.configuration, mounts: [readonlyBindMount] } };
            const response = await client.inspectContainers({ containers: ['poc-mount-test2'] });
            const items = await response.parse(JSON.stringify([withBind]), true);
            expect(items[0].mounts).to.deep.equal([{ type: 'bind', source: '/Users/victorpuga/bindhost', destination: '/hostdata', readOnly: true }]);
        });
    });

    describe('imageAncestors/volumes/networks list filters', () => {
        it('Filters by imageAncestors matching the name:tag reference (the value ImageTreeItem.imageId actually passes)', async () => {
            const response = await client.listContainers({ imageAncestors: ['docker.io/library/alpine:3.19'] });
            const items = await response.parse(JSON.stringify([mountedPublishedContainerRecord]), true);
            expect(items).to.have.lengthOf(1);
        });

        it('Filters by imageAncestors matching the manifest digest as a fallback', async () => {
            const response = await client.listContainers({ imageAncestors: ['sha256:6baf43584bcb78f2e5847d1de515f23499913ac9f12bdf834811a3145eb11ca1'] });
            const items = await response.parse(JSON.stringify([mountedPublishedContainerRecord]), true);
            expect(items).to.have.lengthOf(1);
        });

        it('Excludes non-matching imageAncestors', async () => {
            const response = await client.listContainers({ imageAncestors: ['docker.io/library/busybox:latest'] });
            const items = await response.parse(JSON.stringify([mountedPublishedContainerRecord]), true);
            expect(items).to.have.lengthOf(0);
        });

        it('Filters by volumes matching a mount\'s `type.volume.name`', async () => {
            const response = await client.listContainers({ volumes: ['poc-vol'] });
            const items = await response.parse(JSON.stringify([mountedPublishedContainerRecord]), true);
            expect(items).to.have.lengthOf(1);
        });

        it('Excludes non-matching volumes', async () => {
            const response = await client.listContainers({ volumes: ['other-vol'] });
            const items = await response.parse(JSON.stringify([mountedPublishedContainerRecord]), true);
            expect(items).to.have.lengthOf(0);
        });

        it('Filters by networks matching the already-normalized item.networks', async () => {
            const response = await client.listContainers({ networks: ['default'] });
            const items = await response.parse(JSON.stringify([mountedPublishedContainerRecord]), true);
            expect(items).to.have.lengthOf(1);
        });

        it('Excludes non-matching networks', async () => {
            const response = await client.listContainers({ networks: ['other-net'] });
            const items = await response.parse(JSON.stringify([mountedPublishedContainerRecord]), true);
            expect(items).to.have.lengthOf(0);
        });
    });

    describe('#listContainers() published ports', () => {
        it('Parses published ports (list output carries configuration.publishedPorts too)', async () => {
            const response = await client.listContainers({});
            const items = await response.parse(JSON.stringify([mountedPublishedContainerRecord]), true);
            expect(items[0].ports).to.deep.equal([{ containerPort: 80, hostPort: 8080, hostIp: '0.0.0.0', protocol: 'tcp' }]);
        });
    });

    describe('#createVolume()', () => {
        it('Produces `volume create <name>` args (no --driver flag exists)', async () => {
            const response = await client.createVolume({ name: 'my-vol' });
            expect(asStrings(response.args)).to.deep.equal(['volume', 'create', 'my-vol']);
        });

        it('Throws when a driver is requested (confirmed unsupported)', async () => {
            await expectRejection(() => client.createVolume({ name: 'my-vol', driver: 'somedriver' }));
        });
    });

    describe('#listVolumes()', () => {
        it('Produces `volume list --format json` args with no --filter flags', async () => {
            const response = await client.listVolumes({ driver: 'local', labels: { foo: 'bar' } });
            expect(asStrings(response.args)).to.deep.equal(['volume', 'list', '--format', 'json']);
        });

        it('Parses the nested volume shape', async () => {
            const response = await client.listVolumes({});
            const items = await response.parse(JSON.stringify([alpineVolumeListRecord]), true);
            expect(items).to.have.lengthOf(1);
            expect(items[0]).to.include({ name: 'poc-vol', driver: 'local', scope: 'local', size: 549755813888 });
        });

        it('Filters by driver client-side', async () => {
            const response = await client.listVolumes({ driver: 'nfs' });
            const items = await response.parse(JSON.stringify([alpineVolumeListRecord]), true);
            expect(items).to.have.lengthOf(0);
        });
    });

    describe('#removeVolumes()', () => {
        it('Produces `volume delete` args (not `volume rm`, no --force)', async () => {
            const response = await client.removeVolumes({ volumes: ['my-vol'], force: true });
            expect(asStrings(response.args)).to.deep.equal(['volume', 'delete', 'my-vol']);
        });
    });

    describe('#pruneVolumes()', () => {
        it('Produces `volume prune` args with no options at all (confirmed unsupported)', async () => {
            const response = await client.pruneVolumes({});
            expect(asStrings(response.args)).to.deep.equal(['volume', 'prune']);
        });

        it('Parses "Reclaimed X in disk space" with no per-volume deleted-name list (real 1.2.0 output)', async () => {
            const response = await client.pruneVolumes({});
            const result = await response.parse('Reclaimed 69.4 MB in disk space\n', true);
            expect(result.spaceReclaimed).to.equal(Math.round(69.4 * 1024 * 1024));
            expect(result.volumesDeleted).to.be.undefined;
        });
    });

    describe('#inspectVolumes()', () => {
        it('Produces bare `volume inspect` args with no --format flag (confirmed unsupported)', async () => {
            const response = await client.inspectVolumes({ volumes: ['poc-vol'] });
            expect(asStrings(response.args)).to.deep.equal(['volume', 'inspect', 'poc-vol']);
        });

        it('Parses the same nested shape `volume list` uses', async () => {
            const response = await client.inspectVolumes({ volumes: ['poc-vol'] });
            const items = await response.parse(JSON.stringify([alpineVolumeListRecord]), true);
            expect(items[0]).to.include({ name: 'poc-vol', driver: 'local', mountpoint: alpineVolumeListRecord.configuration.source, scope: 'local' });
        });
    });

    describe('#createNetwork()', () => {
        it('Produces `network create <name>` args, mapping driver onto --plugin (no --driver flag exists)', async () => {
            const response = await client.createNetwork({ name: 'my-net', driver: 'container-network-vmnet' });
            expect(asStrings(response.args)).to.deep.equal(['network', 'create', '--plugin', 'container-network-vmnet', 'my-net']);
        });
    });

    describe('#listNetworks()', () => {
        it('Produces `network list --format json` args with no --filter flags', async () => {
            const response = await client.listNetworks({ driver: 'container-network-vmnet' });
            expect(asStrings(response.args)).to.deep.equal(['network', 'list', '--format', 'json']);
        });

        it('Parses the nested network shape, including `internal` from mode', async () => {
            const response = await client.listNetworks({});
            const items = await response.parse(JSON.stringify([defaultNetworkListRecord, internalNetworkListRecord]), true);
            expect(items).to.have.lengthOf(2);
            expect(items[0]).to.include({ name: 'default', driver: 'container-network-vmnet', internal: false });
            expect(items[1]).to.include({ name: 'poc-net-internal', internal: true });
        });
    });

    describe('#removeNetworks()', () => {
        it('Produces `network delete` args (not `network remove`, no --force)', async () => {
            const response = await client.removeNetworks({ networks: ['my-net'], force: true });
            expect(asStrings(response.args)).to.deep.equal(['network', 'delete', 'my-net']);
        });
    });

    describe('#pruneNetworks()', () => {
        it('Produces `network prune` args with no options at all (confirmed unsupported)', async () => {
            const response = await client.pruneNetworks({});
            expect(asStrings(response.args)).to.deep.equal(['network', 'prune']);
        });

        it('Parses one bare deleted-network name per line, with no "Reclaimed" summary at all (real 1.2.0 output)', async () => {
            const response = await client.pruneNetworks({});
            const result = await response.parse('prune-net-1\nprune-net-2\n', true);
            expect(result.networksDeleted).to.deep.equal(['prune-net-1', 'prune-net-2']);
        });
    });

    describe('#inspectNetworks()', () => {
        it('Produces bare `network inspect` args with no --format flag (confirmed unsupported)', async () => {
            const response = await client.inspectNetworks({ networks: ['default'] });
            expect(asStrings(response.args)).to.deep.equal(['network', 'inspect', 'default']);
        });

        it('Parses the same nested shape `network list` uses, including IPAM from status', async () => {
            const response = await client.inspectNetworks({ networks: ['default'] });
            const items = await response.parse(JSON.stringify([defaultNetworkListRecord]), true);
            expect(items[0]).to.include({ name: 'default', driver: 'container-network-vmnet' });
            expect(items[0].ipam).to.deep.equal({ driver: 'default', config: [{ subnet: '192.168.64.0/24', gateway: '192.168.64.1' }] });
        });
    });

    describe('#readFile()', () => {
        it('Tars the file via `exec` (container cp has no stdout streaming)', async () => {
            const response = await client.readFile({ container: 'abc', path: '/tmp/sub/file.txt' });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['exec', 'abc', 'tar', '-cf', '-', '-C', '/tmp/sub', 'file.txt']);
        });

        it('Handles a root-level file path', async () => {
            const response = await client.readFile({ container: 'abc', path: '/file.txt' });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['exec', 'abc', 'tar', '-cf', '-', '-C', '/', 'file.txt']);
        });
    });

    describe('#writeFile()', () => {
        it('Extracts a stdin tar via `exec -i tar -xf -` (container cp has no stdin streaming)', async () => {
            const response = await client.writeFile({ container: 'abc', path: '/tmp/dest' });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['exec', '--interactive', 'abc', 'tar', '-xf', '-', '-C', '/tmp/dest']);
        });

        it('Falls back to plain `cp` when a host input file is given', async () => {
            const response = await client.writeFile({ container: 'abc', path: '/tmp/dest', inputFile: '/local/file.tar' });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['cp', '/local/file.tar', 'abc:/tmp/dest']);
        });
    });
});
