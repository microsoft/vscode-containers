/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type CommandLineArgs, NoShell } from '@microsoft/vscode-processutils';
import { expect } from 'chai';
import { describe, it } from 'mocha';

import { WslcClient } from '../../../clients/WslcClient/WslcClient';
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

describe('(unit) WslcClient', () => {
    const client = new WslcClient();

    it('Has the expected ClientId and default command', () => {
        expect(WslcClient.ClientId).to.equal('com.microsoft.visualstudio.containers.wslc');
        expect(client.id).to.equal('com.microsoft.visualstudio.containers.wslc');
        expect(client.commandName).to.equal('wslc');
        expect(client.displayName).to.equal('WSLC');
    });

    describe('#listContainers()', () => {
        it('Produces `list --format json` args', async () => {
            const response = await client.listContainers({ all: true });
            expect(response.command).to.equal('wslc');
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['list', '--all', '--format', 'json']);
        });

        it('Parses wslc list output', async () => {
            const response = await client.listContainers({ all: true });
            const items = await response.parse(
                JSON.stringify([
                    {
                        Id: 'abc123',
                        Name: 'cool_yonath',
                        Image: 'alpine:latest',
                        State: 2,
                        CreatedAt: 1700000000,
                        Ports: [],
                    },
                    {
                        Id: 'def456',
                        Name: 'silly_einstein',
                        Image: 'busybox:1.36',
                        State: 3,
                        CreatedAt: 1700000100,
                    },
                    {
                        Id: 'ghi789',
                        Name: 'eager_turing',
                        Image: 'alpine:latest',
                        State: 1,
                        CreatedAt: 1700000200,
                    },
                ]),
                true,
            );
            expect(items).to.have.lengthOf(3);
            expect(items[0]).to.include({ id: 'abc123', name: 'cool_yonath', state: 'running' });
            expect(items[1]).to.include({ id: 'def456', name: 'silly_einstein', state: 'exited' });
            expect(items[2]).to.include({ id: 'ghi789', name: 'eager_turing', state: 'created' });
        });

        it('Parses wslc port bindings (BindingAddress + numeric Protocol)', async () => {
            const response = await client.listContainers({ all: true });
            const items = await response.parse(
                JSON.stringify([
                    {
                        Id: 'p1',
                        Name: 'porty',
                        Image: 'alpine:latest',
                        State: 2,
                        CreatedAt: 1700000000,
                        Ports: [
                            { BindingAddress: '127.0.0.1', ContainerPort: 80, HostPort: 8080, Protocol: 6 },
                            { BindingAddress: '0.0.0.0', ContainerPort: 53, HostPort: 5353, Protocol: 17 },
                            { ContainerPort: 443, HostPort: 8443, Protocol: 6 },
                        ],
                    },
                ]),
                true,
            );
            expect(items).to.have.lengthOf(1);
            expect(items[0].ports).to.deep.include({ hostIp: '127.0.0.1', hostPort: 8080, containerPort: 80, protocol: 'tcp' });
            expect(items[0].ports).to.deep.include({ hostIp: '0.0.0.0', hostPort: 5353, containerPort: 53, protocol: 'udp' });
            // No BindingAddress -> hostIp omitted (matches the Docker parser), not defaulted to loopback.
            expect(items[0].ports).to.deep.include({ hostPort: 8443, containerPort: 443, protocol: 'tcp' });
            const noBindPort = items[0].ports.find(p => p.hostPort === 8443);
            expect(noBindPort).to.not.have.property('hostIp');
        });

        it('Skips a port binding that has no ContainerPort', async () => {
            const response = await client.listContainers({ all: true });
            const items = await response.parse(
                JSON.stringify([
                    {
                        Id: 'p2',
                        Name: 'porty2',
                        Image: 'alpine:latest',
                        State: 2,
                        CreatedAt: 1700000000,
                        Ports: [
                            { BindingAddress: '0.0.0.0', HostPort: 9000, Protocol: 6 }, // no ContainerPort -> skipped
                            { ContainerPort: 80, HostPort: 8080, Protocol: 6 },
                        ],
                    },
                ]),
                true,
            );
            expect(items).to.have.lengthOf(1);
            // Only the valid binding survives; the ContainerPort-less one is dropped rather than fabricated as 0.
            expect(items[0].ports).to.have.lengthOf(1);
            expect(items[0].ports[0]).to.include({ containerPort: 80, hostPort: 8080, protocol: 'tcp' });
        });

        it('Emits --filter args for supported filters', async () => {
            const response = await client.listContainers({
                all: true,
                running: true,
                labels: { 'com.example': 'x' },
                names: ['n1'],
                imageAncestors: ['img1'],
                volumes: ['vol1'],
                networks: ['net1'],
            });
            const args = asStrings(response.args);
            expect(args).to.include('--filter');
            expect(args).to.include('status=running');
            expect(args).to.include('label=com.example=x');
            expect(args).to.include('name=n1');
            expect(args).to.include('ancestor=img1');
            expect(args).to.include('volume=vol1');
            expect(args).to.include('network=net1');
        });

        it('Skips a malformed record in non-strict mode instead of dropping the whole list', async () => {
            const response = await client.listContainers({ all: true });
            const items = await response.parse(
                JSON.stringify([
                    { Id: 'good', Name: 'ok', Image: 'alpine', State: 2, CreatedAt: 1700000000, Ports: [] },
                    { Name: 'missing-id-and-createdAt' }, // invalid: missing required fields
                ]),
                false,
            );
            expect(items).to.have.lengthOf(1);
            expect(items[0]).to.include({ id: 'good' });
        });
    });

    describe('#listImages()', () => {
        it('Produces `images --format json` args', async () => {
            const response = await client.listImages({});
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['images', '--format', 'json']);
        });

        it('Emits --filter args for dangling / reference / label', async () => {
            const response = await client.listImages({
                dangling: false,
                references: ['alpine'],
                labels: { 'com.example': 'x' },
            });
            const args = asStrings(response.args);
            expect(args).to.include('--filter');
            expect(args).to.include('dangling=false');
            expect(args).to.include('reference=alpine');
            expect(args).to.include('label=com.example=x');
        });

        it('Skips a malformed record in non-strict mode', async () => {
            const response = await client.listImages({});
            const items = await response.parse(
                JSON.stringify([
                    { Id: 'sha256:aaaa', Repository: 'alpine', Tag: 'latest', Created: 1700000000, Size: 1 },
                    { Repository: 'no-id' }, // invalid: missing required Id/Created
                ]),
                false,
            );
            expect(items).to.have.lengthOf(1);
            expect(items[0]).to.have.property('id', 'sha256:aaaa');
        });

        it('Parses wslc images output', async () => {
            const response = await client.listImages({});
            const items = await response.parse(
                JSON.stringify([
                    {
                        Id: 'sha256:aaaa',
                        Repository: 'alpine',
                        Tag: 'latest',
                        Created: 1700000000,
                        Size: 7000000,
                    },
                ]),
                true,
            );
            expect(items).to.have.lengthOf(1);
            expect(items[0]).to.have.property('id', 'sha256:aaaa');
            expect(items[0]).to.have.property('createdAt');
            expect(items[0].createdAt.getDay()).to.not.be.NaN;
        });
    });

    describe('#removeImages()', () => {
        it('Produces `rmi` args', async () => {
            const response = await client.removeImages({ imageRefs: ['alpine:latest'], force: true });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['rmi', '--force', 'alpine:latest']);
        });
    });

    describe('#removeContainers()', () => {
        it('Produces `remove` args', async () => {
            const response = await client.removeContainers({ containers: ['abc'], force: true });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['remove', '--force', 'abc']);
        });
    });

    describe('#inspectContainers()', () => {
        it('Produces `inspect --type container` args', async () => {
            const response = await client.inspectContainers({ containers: ['abc'] });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['inspect', '--type', 'container', 'abc']);
        });

        it('Parses single-object inspect payload', async () => {
            const response = await client.inspectContainers({ containers: ['abc'] });
            const items = await response.parse(
                JSON.stringify({
                    Id: 'abc',
                    Name: '/foo',
                    Image: 'alpine:latest',
                    Created: '2024-01-01T00:00:00Z',
                    Config: {},
                    State: { Status: 'running' },
                    NetworkSettings: { Ports: {} },
                    HostConfig: {},
                    Mounts: [],
                }),
                false,
            );
            expect(items).to.have.lengthOf(1);
            expect(items[0]).to.have.property('id', 'abc');
        });

        it('Sets each item\'s `raw` to its own record, not the whole array', async () => {
            const response = await client.inspectContainers({ containers: ['abc', 'def'] });
            const recordA = { Id: 'abc', Name: '/a', Image: 'alpine:latest', Created: '2024-01-01T00:00:00Z', Config: {}, State: { Status: 'running' }, NetworkSettings: { Ports: {} }, HostConfig: {}, Mounts: [] };
            const recordB = { Id: 'def', Name: '/b', Image: 'busybox:1.36', Created: '2024-01-02T00:00:00Z', Config: {}, State: { Status: 'exited' }, NetworkSettings: { Ports: {} }, HostConfig: {}, Mounts: [] };
            const items = await response.parse(JSON.stringify([recordA, recordB]), false);
            expect(items).to.have.lengthOf(2);
            // Each raw is that record's JSON only (matching nerdctl), not the full trimmed array output.
            expect(JSON.parse(items[0].raw)).to.deep.equal(recordA);
            expect(JSON.parse(items[1].raw)).to.deep.equal(recordB);
        });

        it('Reads bind-mount readOnly from the `ReadWrite` field', async () => {
            const response = await client.inspectContainers({ containers: ['abc'] });
            const items = await response.parse(
                JSON.stringify({
                    Id: 'abc',
                    Name: '/foo',
                    Image: 'alpine:latest',
                    Created: '2024-01-01T00:00:00Z',
                    Config: {},
                    State: { Status: 'running' },
                    NetworkSettings: { Ports: {} },
                    HostConfig: {},
                    Mounts: [
                        { Type: 'bind', Source: 'C:\\ro', Destination: '/ro', ReadWrite: false },
                        { Type: 'bind', Source: 'C:\\rw', Destination: '/rw', ReadWrite: true },
                    ],
                }),
                false,
            );
            const mounts = items[0].mounts;
            expect(mounts.find(m => m.destination === '/ro')?.readOnly).to.equal(true);
            expect(mounts.find(m => m.destination === '/rw')?.readOnly).to.equal(false);
        });
    });

    describe('#inspectImages()', () => {
        it('Produces `inspect --type image` args', async () => {
            const response = await client.inspectImages({ imageRefs: ['alpine:latest'] });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['inspect', '--type', 'image', 'alpine:latest']);
        });
    });

    describe('#version()', () => {
        it('Produces `version` with no format flag', async () => {
            const response = await client.version({});
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['version']);
        });

        it('Parses plain-text version output', async () => {
            const response = await client.version({});
            const parsed = await response.parse('wslc 2.9.3.0\n', true);
            expect(parsed).to.have.property('client', '2.9.3.0');
            expect(parsed).to.have.property('server', undefined);
        });
    });

    describe('#checkInstall()', () => {
        it('Produces `--version` args', async () => {
            const response = await client.checkInstall({});
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['--version']);
        });
    });

    describe('#buildImage()', () => {
        it('Produces `build` args without per-resource `image` prefix', async () => {
            const response = await client.buildImage({ path: '.' });
            const args = asStrings(response.args);
            expect(args[0]).to.equal('build');
            expect(args).to.include('.');
        });
    });

    describe('#info()', () => {
        it('Synthesizes a linux InfoItem because wslc has no info command', async () => {
            const response = await client.info({});
            const item = await response.parse('whatever', false);
            expect(item).to.have.property('osType', 'linux');
        });

        it('Runs `--version` because the output is not used', async () => {
            const response = await client.info({});
            expect(asStrings(response.args)).to.deep.equal(['--version']);
        });
    });

    describe('#createNetwork()', () => {
        it('Produces `network create <name>` args', async () => {
            const response = await client.createNetwork({ name: 'my-net' });
            expect(response.command).to.equal('wslc');
            expect(asStrings(response.args)).to.deep.equal(['network', 'create', 'my-net']);
        });

        it('Includes --driver when provided', async () => {
            const response = await client.createNetwork({ name: 'my-net', driver: 'bridge' });
            expect(asStrings(response.args)).to.deep.equal(['network', 'create', '--driver', 'bridge', 'my-net']);
        });
    });

    describe('#listNetworks()', () => {
        it('Produces `network list --format json` args', async () => {
            const response = await client.listNetworks({});
            expect(response.command).to.equal('wslc');
            expect(asStrings(response.args)).to.deep.equal(['network', 'list', '--format', 'json']);
        });

        it('Does not emit filter args (wslc has no --filter flag)', async () => {
            const response = await client.listNetworks({ driver: 'bridge', labels: { foo: 'bar' } });
            expect(asStrings(response.args)).to.deep.equal(['network', 'list', '--format', 'json']);
        });

        it('Filters parsed results by label client-side', async () => {
            const response = await client.listNetworks({ labels: { keep: 'yes' } });
            const payload = JSON.stringify([
                { Name: 'match', Driver: 'bridge', Labels: { keep: 'yes' } },
                { Name: 'wrong-value', Driver: 'bridge', Labels: { keep: 'no' } },
                { Name: 'missing-label', Driver: 'bridge', Labels: {} },
            ]);
            const items = await response.parse(payload, true);
            expect(items.map(i => i.name)).to.deep.equal(['match']);
        });

        it('Filters parsed results by label presence (boolean true) client-side', async () => {
            const response = await client.listNetworks({ labels: { present: true } });
            const payload = JSON.stringify([
                { Name: 'has-label', Driver: 'bridge', Labels: { present: 'anything' } },
                { Name: 'no-label', Driver: 'bridge', Labels: { other: 'x' } },
            ]);
            const items = await response.parse(payload, true);
            expect(items.map(i => i.name)).to.deep.equal(['has-label']);
        });

        it('Filters parsed results by driver client-side', async () => {
            const response = await client.listNetworks({ driver: 'bridge' });
            const payload = JSON.stringify([
                { Name: 'a', Driver: 'bridge' },
                { Name: 'b', Driver: 'host' },
            ]);
            const items = await response.parse(payload, true);
            expect(items.map(i => i.name)).to.deep.equal(['a']);
        });

        it('Parses wslc network list JSON output', async () => {
            const response = await client.listNetworks({});
            const items = await response.parse(
                JSON.stringify([
                    {
                        Id: 'net-abc',
                        Name: 'bridge',
                        Driver: 'bridge',
                        Scope: 'local',
                        Labels: { foo: 'bar' },
                        EnableIPv6: false,
                        Internal: false,
                    },
                    {
                        Name: 'host',
                        Driver: 'host',
                    },
                ]),
                true,
            );
            expect(items).to.have.lengthOf(2);
            expect(items[0]).to.include({ id: 'net-abc', name: 'bridge', driver: 'bridge', scope: 'local', ipv6: false, internal: false });
            expect(items[0].labels).to.deep.equal({ foo: 'bar' });
            expect(items[1]).to.include({ name: 'host', driver: 'host' });
        });

        it('Accepts a single-object payload', async () => {
            const response = await client.listNetworks({});
            const items = await response.parse(
                JSON.stringify({ Name: 'bridge', Driver: 'bridge' }),
                true,
            );
            expect(items).to.have.lengthOf(1);
            expect(items[0]).to.include({ name: 'bridge', driver: 'bridge' });
        });
    });

    describe('#removeNetworks()', () => {
        it('Produces `network remove --force <names...>` args', async () => {
            const response = await client.removeNetworks({ networks: ['a', 'b'], force: true });
            expect(asStrings(response.args)).to.deep.equal(['network', 'remove', '--force', 'a', 'b']);
        });
    });

    describe('#inspectNetworks()', () => {
        it('Produces `inspect --type network <name>` args for a single network', async () => {
            const response = await client.inspectNetworks({ networks: ['bridge'] });
            expect(asStrings(response.args)).to.deep.equal(['inspect', '--type', 'network', 'bridge']);
        });

        it('Produces multi-id `inspect --type network <names...>` args', async () => {
            const response = await client.inspectNetworks({ networks: ['bridge', 'host'] });
            expect(asStrings(response.args)).to.deep.equal(['inspect', '--type', 'network', 'bridge', 'host']);
        });

        it('Parses single-object inspect payload', async () => {
            const response = await client.inspectNetworks({ networks: ['bridge'] });
            const items = await response.parse(
                JSON.stringify({
                    Id: 'net-abc',
                    Name: 'bridge',
                    Driver: 'bridge',
                    Scope: 'local',
                    Labels: {},
                    IPAM: { Driver: 'default', Config: [{ Subnet: '10.0.0.0/24', Gateway: '10.0.0.1' }] },
                    EnableIPv6: false,
                    Internal: false,
                    Attachable: true,
                    Ingress: false,
                    Created: '2026-01-02T03:04:05Z',
                }),
                true,
            );
            expect(items).to.have.lengthOf(1);
            const network = items[0];
            expect(network).to.include({ id: 'net-abc', name: 'bridge', driver: 'bridge', scope: 'local', ipv6: false, internal: false, attachable: true, ingress: false });
            expect(network.ipam).to.deep.equal({ driver: 'default', config: [{ subnet: '10.0.0.0/24', gateway: '10.0.0.1' }] });
            expect(network.createdAt).to.be.instanceOf(Date);
            expect(network.raw).to.be.a('string');
        });
    });

    describe('Unsupported commands', () => {
        it('getEventStream rejects with CommandNotSupportedError', async () => {
            await expectRejection(client.getEventStream({}));
        });

        it('restartContainers rejects with CommandNotSupportedError', async () => {
            await expectRejection(client.restartContainers({ container: ['abc'] }));
        });

        it('unpauseContainers rejects with CommandNotSupportedError', async () => {
            await expectRejection(client.unpauseContainers({ container: ['abc'] }));
        });
    });

    describe('#listVolumes()', () => {
        it('Produces `volume list --format json` args', async () => {
            const response = await client.listVolumes({});
            expect(asStrings(response.args)).to.deep.equal(['volume', 'list', '--format', 'json']);
        });

        it('Does not emit filter args (wslc has no --filter flag)', async () => {
            const response = await client.listVolumes({ driver: 'local', labels: { foo: 'bar' } });
            expect(asStrings(response.args)).to.deep.equal(['volume', 'list', '--format', 'json']);
        });

        it('Filters parsed results by label client-side', async () => {
            const response = await client.listVolumes({ labels: { keep: 'yes' } });
            const payload = JSON.stringify([
                { Name: 'match', Driver: 'local', Labels: { keep: 'yes' } },
                { Name: 'wrong-value', Driver: 'local', Labels: { keep: 'no' } },
                { Name: 'missing-label', Driver: 'local', Labels: {} },
            ]);
            const items = await response.parse(payload, true);
            expect(items.map(i => i.name)).to.deep.equal(['match']);
        });

        it('Filters parsed results by driver client-side', async () => {
            const response = await client.listVolumes({ driver: 'local' });
            const payload = JSON.stringify([
                { Name: 'a', Driver: 'local' },
                { Name: 'b', Driver: 'custom' },
            ]);
            const items = await response.parse(payload, true);
            expect(items.map(i => i.name)).to.deep.equal(['a']);
        });
    });

    describe('#pruneVolumes()', () => {
        it('Produces `volume prune` args without --force', async () => {
            const response = await client.pruneVolumes({});
            expect(asStrings(response.args)).to.deep.equal(['volume', 'prune']);
        });

        it('Parses `Deleted: <name>` output', async () => {
            const response = await client.pruneVolumes({});
            const result = await response.parse('Deleted: vol-a\nDeleted: vol-b\n\nTotal reclaimed space: 0 B', true);
            expect(result.volumesDeleted).to.deep.equal(['vol-a', 'vol-b']);
        });
    });

    describe('#pruneNetworks()', () => {
        it('Produces `network prune` args without --force', async () => {
            const response = await client.pruneNetworks({});
            expect(asStrings(response.args)).to.deep.equal(['network', 'prune']);
        });

        it('Parses `Deleted: <name>` output', async () => {
            const response = await client.pruneNetworks({});
            const result = await response.parse('Deleted: net-a\nDeleted: net-b', true);
            expect(result.networksDeleted).to.deep.equal(['net-a', 'net-b']);
        });
    });

    describe('#pullImage()', () => {
        it('Produces `pull <ref>` args (no --all-tags / --disable-content-trust)', async () => {
            const response = await client.pullImage({ imageRef: 'alpine:latest', allTags: true, disableContentTrust: true });
            expect(asStrings(response.args)).to.deep.equal(['pull', 'alpine:latest']);
        });
    });

    describe('#pruneImages()', () => {
        it('Produces `image prune` args without --force', async () => {
            const response = await client.pruneImages({});
            expect(asStrings(response.args)).to.deep.equal(['image', 'prune']);
        });

        it('Includes --all when requested', async () => {
            const response = await client.pruneImages({ all: true });
            expect(asStrings(response.args)).to.deep.equal(['image', 'prune', '--all']);
        });
    });

    describe('#pruneContainers()', () => {
        it('Produces `container prune` args without --force or --filter', async () => {
            const response = await client.pruneContainers({});
            expect(asStrings(response.args)).to.deep.equal(['container', 'prune']);
        });
    });

    describe('#removeVolumes()', () => {
        it('Produces `volume rm --force <names...>` args', async () => {
            const response = await client.removeVolumes({ volumes: ['v1', 'v2'], force: true });
            expect(asStrings(response.args)).to.deep.equal(['volume', 'rm', '--force', 'v1', 'v2']);
        });
    });

    describe('#runContainer()', () => {
        it('Emits supported flags', async () => {
            const response = await client.runContainer({
                imageRef: 'alpine:latest',
                name: 'demo',
                detached: true,
                interactive: false,
                removeOnExit: true,
                network: 'mynet',
                ports: [{ hostPort: 8080, containerPort: 80, protocol: 'tcp' }],
                publishAllPorts: true,
                labels: { env: 'dev' },
                environmentVariables: { FOO: 'bar' },
                entrypoint: '/bin/sh',
            });
            const args = asStrings(response.args);
            expect(args).to.include('run');
            expect(args).to.include('--detach');
            expect(args).to.include('--rm');
            expect(args).to.include('--name');
            expect(args).to.include('demo');
            expect(args).to.include('--network');
            expect(args).to.include('mynet');
            expect(args).to.include('--publish');
            expect(args).to.include('--publish-all');
            expect(args).to.include('--label');
            expect(args).to.include('env=dev');
            expect(args).to.include('--env');
            expect(args).to.include('FOO=bar');
            expect(args).to.include('--entrypoint');
            expect(args).to.include('/bin/sh');
            expect(args).to.include('alpine:latest');
        });

        it('Emits --network-alias when set', async () => {
            const response = await client.runContainer({
                imageRef: 'alpine:latest',
                network: 'mynet',
                networkAlias: 'myalias',
            });
            const args = asStrings(response.args);
            expect(args).to.include('--network-alias');
            expect(args).to.include('myalias');
        });

        it('Throws when addHost has entries', async () => {
            await expectRejection(() => client.runContainer({
                imageRef: 'alpine:latest',
                addHost: [{ hostname: 'foo.local', ip: '127.0.0.1' }],
            }));
        });

        it('Throws when exposePorts has entries', async () => {
            await expectRejection(() => client.runContainer({
                imageRef: 'alpine:latest',
                exposePorts: [3000],
            }));
        });

        it('Throws when platform is set', async () => {
            await expectRejection(() => client.runContainer({
                imageRef: 'alpine:latest',
                platform: { os: 'linux' },
            }));
        });

        it('Emits --volume (not --mount) for mounts', async () => {
            const response = await client.runContainer({
                imageRef: 'alpine:latest',
                mounts: [
                    { type: 'bind', source: 'C:\\src', destination: '/src', readOnly: false },
                    { type: 'volume', source: 'data', destination: '/data', readOnly: true },
                ],
            });
            const args = asStrings(response.args);
            expect(args).to.include('--volume');
            expect(args).to.include('C:\\src:/src');
            expect(args).to.include('data:/data:ro');
            expect(args).to.not.include('--mount');
        });
    });

    describe('#readFile()', () => {
        it('Tars the file via `container exec` (wslc has no cp-to-stdout)', async () => {
            const response = await client.readFile({ container: 'abc', path: '/tmp/sub/file.txt' });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['container', 'exec', 'abc', 'tar', '-cf', '-', '-C', '/tmp/sub', 'file.txt']);
        });

        it('Handles a root-level file path', async () => {
            const response = await client.readFile({ container: 'abc', path: '/file.txt' });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['container', 'exec', 'abc', 'tar', '-cf', '-', '-C', '/', 'file.txt']);
        });
    });

    describe('#writeFile()', () => {
        it('Produces `container cp - <container>:<dir>` for stdin tar input', async () => {
            const response = await client.writeFile({ container: 'abc', path: '/tmp/dest' });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['container', 'cp', '-', 'abc:/tmp/dest']);
        });

        it('Uses the provided input file when set', async () => {
            const response = await client.writeFile({ container: 'abc', path: '/tmp/dest', inputFile: 'C:\\local.tar' });
            const args = asStrings(response.args);
            expect(args).to.deep.equal(['container', 'cp', 'C:\\local.tar', 'abc:/tmp/dest']);
        });
    });

    describe('#listFiles()', () => {
        it('Runs stat non-interactively (no --interactive)', async () => {
            const response = await client.listFiles({ container: 'abc', path: '/var/log', operatingSystem: 'linux' });
            const args = asStrings(response.args);
            expect(args).to.not.include('--interactive');
            expect(args.slice(0, 5)).to.deep.equal(['container', 'exec', 'abc', '/bin/sh', '-c']);
        });

        it('Stats the directory contents, tolerating empty dirs', async () => {
            const response = await client.listFiles({ container: 'abc', path: '/var/log', operatingSystem: 'linux' });
            const script = asStrings(response.args).at(-1) ?? '';
            expect(script).to.contain('stat -c');
            expect(script).to.contain('"/var/log/"*');
            expect(script).to.contain('|| true');
        });
    });

    describe('#statPath()', () => {
        it('Runs stat non-interactively (no --interactive)', async () => {
            const response = await client.statPath({ container: 'abc', path: '/etc/hosts', operatingSystem: 'linux' });
            const args = asStrings(response.args);
            expect(args).to.not.include('--interactive');
            expect(args.slice(0, 5)).to.deep.equal(['container', 'exec', 'abc', '/bin/sh', '-c']);
            expect(asStrings(response.args).at(-1) ?? '').to.contain('stat -c');
            expect(asStrings(response.args).at(-1) ?? '').to.contain('"/etc/hosts"');
        });
    });
});
