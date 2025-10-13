/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Bash, NoShell } from '@microsoft/vscode-processutils';
import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as stream from 'stream';
import { FileType } from 'vscode';
import { DockerClient } from '../clients/DockerClient/DockerClient';
import { PodmanClient } from '../clients/PodmanClient/PodmanClient';
import { ShellStreamCommandRunnerFactory, ShellStreamCommandRunnerOptions } from '../commandRunners/shellStream';
import { WslShellCommandRunnerFactory, WslShellCommandRunnerOptions } from '../commandRunners/wslStream';
import { IContainersClient, ListContainersItem, ListImagesItem, ListNetworkItem, ListVolumeItem, StatPathItem } from '../contracts/ContainerClient';
import { CommandResponseBase, ICommandRunnerFactory } from '../contracts/CommandRunner';
import { wslifyPath } from '../utils/wslifyPath';

/**
 * WARNING: This test suite will prune unused images, containers, networks, and volumes.
 */

// Modify the below options to configure the tests, or pick at F5 time
const clientTypeToTest: ClientType = (process.env.CONTAINER_CLIENT_TYPE || 'docker') as ClientType;
const runInWsl: boolean = (process.env.RUN_IN_WSL === '1' || process.env.RUN_IN_WSL === 'true') || false; // Set to true if running in WSL

// No need to modify below this

export type ClientType = 'docker' | 'podman';

describe('(integration) ContainersClientE2E', function () {

    // #region Test Setup

    let client: IContainersClient;
    let defaultRunner: ICommandRunnerFactory;
    let defaultRunnerFactory: (options: ShellStreamCommandRunnerOptions) => ICommandRunnerFactory;

    this.timeout(10000); // Set a longer timeout for integration tests

    before(function () {
        if (clientTypeToTest === 'docker') {
            client = new DockerClient();
        } else if (clientTypeToTest === 'podman') {
            client = new PodmanClient();
        } else {
            throw new Error('Invalid clientTypeToTest');
        }

        if (!runInWsl) {
            defaultRunnerFactory = (options: ShellStreamCommandRunnerOptions) => new ShellStreamCommandRunnerFactory(options);
        } else {
            defaultRunnerFactory = (options: WslShellCommandRunnerOptions) => new WslShellCommandRunnerFactory(options);
        }

        defaultRunner = defaultRunnerFactory({ strict: true, shellProvider: new NoShell(), });
    });

    // #endregion

    // #region Client Identity

    describe('Client Identity', function () {
        it('ClientIdentity', function () {
            expect(client.id).to.be.a('string');
            expect(client.displayName).to.be.a('string');
            expect(client.description).to.be.a('string');
            expect(client.commandName).to.be.a('string');
        });

        it('ImageNameDefaults', function () {
            expect(client.defaultRegistry).to.be.a('string');
            expect(client.defaultTag).to.be.a('string');
        });
    });

    // #endregion

    // #region System Info

    describe('System Info', function () {
        it('VersionCommand', async function () {
            const version = await defaultRunner.getCommandRunner()(
                client.version({})
            );

            expect(version).to.be.ok;
            expect(version.client).to.be.a('string');

            if (clientTypeToTest === 'docker') {
                expect(version.server).to.be.a('string');
            }
            // Server version is optional for podman so we won't check it
        });

        it('CheckInstallCommand', async function () {
            const checkInstall = await defaultRunner.getCommandRunner()(
                client.checkInstall({})
            );

            expect(checkInstall).to.be.ok;
            expect(checkInstall).to.be.a('string');
        });

        it('InfoCommand', async function () {
            const info = await defaultRunner.getCommandRunner()(
                client.info({})
            );

            expect(info).to.be.ok;
            expect(info.osType).to.be.a('string');
            expect(info.raw).to.be.a('string');
        });
    });

    // #endregion

    // #region Images

    describe('Images', function () {
        const imageToTest = 'alpine:latest';
        let testDockerfileContext: string;
        let testDockerfile: string;

        before('Images', async function () {
            // Prepare the test Dockerfile context
            testDockerfileContext = path.resolve(__dirname, 'buildContext');
            testDockerfile = path.resolve(testDockerfileContext, 'Dockerfile');

            // Create the test Dockerfile and context if it doesn't exist
            try {
                await fs.mkdir(testDockerfileContext, { recursive: true });
                await fs.writeFile(testDockerfile, TestDockerfileContent);
            } catch (error) {
                // Ignore error
            }

            if (runInWsl) {
                testDockerfileContext = wslifyPath(testDockerfileContext);
                testDockerfile = wslifyPath(testDockerfile);
            }

            // Pull a small image for testing
            // This also tests PullImageCommand
            await defaultRunner.getCommandRunner()(
                client.pullImage({ imageRef: imageToTest })
            );
        });

        it('ListImagesCommand', async function () {
            const image = await validateImageExists(client, defaultRunner, imageToTest);

            expect(image).to.be.ok;
            expect(image?.image.originalName).to.include(imageToTest);
            expect(image?.id).to.be.a('string');
            expect(image?.createdAt).to.be.instanceOf(Date);
        });

        it('TagImageCommand', async function () {
            const testTag = 'tag-test-image:latest';

            // Tag the image
            await defaultRunner.getCommandRunner()(
                client.tagImage({ fromImageRef: imageToTest, toImageRef: testTag })
            );

            // Verify the image was tagged
            expect(await validateImageExists(client, defaultRunner, testTag)).to.be.ok;

            // Remove the image using our tag
            const removedImages = await defaultRunner.getCommandRunner()(
                client.removeImages({ imageRefs: [testTag], force: true })
            );

            expect(removedImages).to.be.ok;
            expect(removedImages).to.be.an('array');
            expect(await validateImageExists(client, defaultRunner, testTag)).to.not.be.ok;
        });

        it('InspectImagesCommand', async function () {
            // Inspect the image
            const images = await defaultRunner.getCommandRunner()(
                client.inspectImages({ imageRefs: ['alpine:latest'] })
            );

            expect(images).to.be.ok;
            expect(images).to.be.an('array');
            expect(images.length).to.equal(1);

            const image = images[0];
            expect(image.id).to.be.a('string');
            expect(image.image).to.be.an('object');
            expect(image.repoDigests).to.be.an('array');
            expect(image.entrypoint).to.be.an('array');
            expect(image.command).to.be.an('array');
            expect(image.labels).to.be.an('object');
            expect(image.createdAt).to.be.instanceOf(Date);
            expect(image.raw).to.be.a('string');
        });

        it('BuildImageCommand', async function () {
            const testTag = 'build-test-image:latest';

            await defaultRunner.getCommandRunner()(
                client.buildImage({
                    path: testDockerfileContext,
                    file: testDockerfile,
                    tags: [testTag],
                })
            );

            // Verify the image was built
            expect(await validateImageExists(client, defaultRunner, testTag)).to.be.ok;

            // Remove the image using our tag
            const removedImages = await defaultRunner.getCommandRunner()(
                client.removeImages({ imageRefs: [testTag], force: true })
            );

            expect(removedImages).to.be.ok;
            expect(removedImages).to.be.an('array');
            expect(await validateImageExists(client, defaultRunner, testTag)).to.not.be.ok;
        });

        it('PullImageCommand', async function () {
            // This is already fully tested between the before('Images') hook and it('ListImagesCommand') test
        });

        it('PushImageCommand', async function () {
            const testTag = 'push-test-image:latest';

            // Since we can't actually push without credentials, we'll verify the command generation
            const command = await client.pushImage({ imageRef: testTag });
            expect(command).to.be.ok;
            expect(command.command).to.be.a('string');
            expect(command.args).to.be.an('array');

            // We expect push and the image reference
            expect(getBashCommandLine(command)).to.equal(`${client.commandName} image push ${testTag}`);
        });

        it('RemoveImagesCommand', async function () {
            // This is already fully tested in the it('BuildImageCommand') test
        });

        it('PruneImagesCommand', async function () {
            // Build an image without a tag, which we can subsequently prune
            await defaultRunner.getCommandRunner()(
                client.buildImage({
                    path: testDockerfileContext,
                    file: testDockerfile,
                })
            );

            // Prune the image
            const pruneResult = await defaultRunner.getCommandRunner()(
                client.pruneImages({})
            );

            expect(pruneResult).to.be.ok;
            if (pruneResult.imageRefsDeleted) {
                expect(pruneResult.imageRefsDeleted).to.be.an('array');
                expect(pruneResult.imageRefsDeleted.length).to.be.greaterThan(0);
            }
            if (pruneResult.spaceReclaimed !== undefined) {
                expect(pruneResult.spaceReclaimed).to.be.a('number');
            }
        });
    });

    // #endregion

    // #region Containers

    describe('Containers', function () {
        const imageToTest = 'alpine:latest';
        const testContainerName = 'test-container-e2e';
        const testContainerNetworkName = 'test-networkForContainer-e2e';
        const testContainerVolumeName = 'test-volumeForContainer-e2e';
        let testContainerBindMountSource: string;
        let testContainerId: string;

        before('Containers', async function () {
            testContainerBindMountSource = __dirname;

            // If running in WSL, convert the bind mount source path to WSL format
            if (runInWsl) {
                testContainerBindMountSource = wslifyPath(testContainerBindMountSource);
            }

            // Pull a small image for testing
            await defaultRunner.getCommandRunner()(
                client.pullImage({ imageRef: imageToTest })
            );

            // Try removing the container if it exists so we don't get a name/port conflict
            try {
                await defaultRunner.getCommandRunner()(
                    client.removeContainers({ containers: [testContainerName], force: true })
                );
            } catch (error) {
                // Ignore error if the container doesn't exist
            }

            // Try removing the network if it exists so we don't get a name conflict
            try {
                await defaultRunner.getCommandRunner()(
                    client.removeNetworks({ networks: [testContainerNetworkName] })
                );
            } catch (error) {
                // Ignore error if the network doesn't exist
            }

            // Try removing the volume if it exists so we don't get a name conflict
            try {
                await defaultRunner.getCommandRunner()(
                    client.removeVolumes({ volumes: [testContainerVolumeName] })
                );
            } catch (error) {
                // Ignore error if the volume doesn't exist
            }

            // Create a network for the container
            await defaultRunner.getCommandRunner()(
                client.createNetwork({ name: testContainerNetworkName })
            );

            // Create a volume for the container
            await defaultRunner.getCommandRunner()(
                client.createVolume({ name: testContainerVolumeName })
            );

            // Create a container that will stay running
            // For fun we'll add a network, a bind mount, a volume, and some ports to it and verify those in both
            // it('ListContainersCommand') and it('InspectContainersCommand')
            testContainerId = await defaultRunner.getCommandRunner()(
                client.runContainer({
                    imageRef: imageToTest,
                    detached: true,
                    name: testContainerName,
                    network: testContainerNetworkName,
                    mounts: [
                        { type: 'bind', source: testContainerBindMountSource, destination: '/data1', readOnly: true },
                        { type: 'volume', source: testContainerVolumeName, destination: '/data2', readOnly: false }
                    ],
                    ports: [{ hostPort: 8080, containerPort: 80 }],
                    exposePorts: [3000], // Uses the `--expose` flag to expose a port without binding it
                    publishAllPorts: true, // Which will then get bound to a random port on the host, due to this flag
                })
            ) as string;
        });

        after('Containers', async function () {
            this.timeout(20000); // Increase timeout for cleanup

            // Clean up the test container if it exists
            if (testContainerId) {
                await defaultRunner.getCommandRunner()(
                    client.removeContainers({ containers: [testContainerId], force: true })
                );
            }

            // Try removing the network if it exists so we don't get a name conflict
            try {
                await defaultRunner.getCommandRunner()(
                    client.removeNetworks({ networks: [testContainerNetworkName] })
                );
            } catch (error) {
                // Ignore error if the network doesn't exist
            }

            // Try removing the volume if it exists so we don't get a name conflict
            try {
                await defaultRunner.getCommandRunner()(
                    client.removeVolumes({ volumes: [testContainerVolumeName] })
                );
            } catch (error) {
                // Ignore error if the volume doesn't exist
            }
        });

        it('RunContainerCommand', async function () {
            // Ensure the container was created
            expect(testContainerId).to.be.a('string');
            expect(await validateContainerExists(client, defaultRunner, { containerId: testContainerId })).to.be.ok;
        });

        it('ListContainersCommand', async function () {
            const container = await validateContainerExists(client, defaultRunner, { containerId: testContainerId }) as ListContainersItem;
            expect(container).to.be.ok;

            // Validate some important properties
            expect(container.name).to.equal(testContainerName);
            expect(container.state).to.be.a('string');
            expect(container.image).to.be.an('object');
            expect(container.createdAt).to.be.instanceOf(Date);

            // Validate the network
            expect(container.networks).to.be.an('array');
            expect(container.networks).to.include(testContainerNetworkName);

            // Validate the ports
            expect(container.ports).to.be.an('array');
            expect(container.ports.some(p => p.hostPort === 8080 && p.containerPort === 80)).to.be.true;
            expect(container.ports.some(p => p.containerPort === 3000 && !!p.hostPort && p.hostPort > 0 && p.hostPort < 65536)).to.be.true; // Exposed port with random binding

            // Volumes and bind mounts do not show up in ListContainersCommand, so we won't validate those here
        });

        it('InspectContainersCommand', async function () {
            const containers = await defaultRunner.getCommandRunner()(
                client.inspectContainers({ containers: [testContainerId] })
            );

            expect(containers).to.be.ok;
            expect(containers).to.be.an('array');
            expect(containers.length).to.equal(1);

            const container = containers[0];

            // Validate some important properties
            expect(container.id).to.equal(testContainerId);
            expect(container.name).to.include(testContainerName);
            expect(container.image).to.be.an('object');
            expect(container.environmentVariables).to.be.an('object');
            expect(container.labels).to.be.an('object');
            expect(container.entrypoint).to.be.an('array');
            expect(container.command).to.be.an('array');
            expect(container.createdAt).to.be.instanceOf(Date);
            expect(container.raw).to.be.a('string');

            // Validate the network
            expect(container.networks).to.be.an('array');
            expect(container.networks.some(n => n.name === testContainerNetworkName)).to.be.true;

            // Validate the bind mount
            expect(container.mounts).to.be.an('array');
            expect(container.mounts.some(m => m.type === 'bind' && m.source === testContainerBindMountSource && m.destination === '/data1' && m.readOnly === true)).to.be.true;

            // Validate the volume
            expect(container.mounts).to.be.an('array');
            expect(container.mounts.some(m => m.type === 'volume' && m.source === testContainerVolumeName && m.destination === '/data2' && m.readOnly === false)).to.be.true;

            // Validate the ports
            expect(container.ports).to.be.an('array');
            expect(container.ports.some(p => p.hostPort === 8080 && p.containerPort === 80)).to.be.true;
            expect(container.ports.some(p => p.containerPort === 3000 && !!p.hostPort && p.hostPort > 0 && p.hostPort < 65536)).to.be.true; // Exposed port with random binding
        });

        it('ExecContainerCommand', async function () {
            const content = 'Hello from the container!';
            // Ensure we have a running container
            expect(testContainerId).to.be.a('string');

            // Execute a command
            const commandStream = defaultRunner.getStreamingCommandRunner()(
                client.execContainer({
                    container: testContainerId,
                    command: ['echo', content]
                })
            );

            let output = '';
            for await (const chunk of commandStream) {
                output += chunk;
            }

            expect(output.trim()).to.equal(content);
        });

        it('LogsForContainerCommand', async function () {
            const content = 'Log entry for testing';

            // Generate some logs in a new container
            const testContainerId2 = await defaultRunner.getCommandRunner()(
                client.runContainer({
                    imageRef: imageToTest,
                    detached: true,
                    entrypoint: 'sh',
                    command: ['-c', `"echo '${content}'"`]
                })
            ) as string;

            expect(testContainerId2).to.be.a('string');

            // Get logs
            const logsStream = defaultRunner.getStreamingCommandRunner()(
                client.logsForContainer({
                    container: testContainerId2,
                    tail: 10,
                    follow: false,
                })
            );

            let logs = '';
            for await (const chunk of logsStream) {
                logs += chunk;
            }

            expect(logs).to.include(content);
        });

        it('StopContainersCommand', async function () {
            // Stop the container
            const stoppedContainers = await defaultRunner.getCommandRunner()(
                client.stopContainers({ container: [testContainerId], time: 1 })
            );

            expect(stoppedContainers).to.be.ok;
            expect(stoppedContainers).to.be.an('array');
            expect(stoppedContainers).to.include(testContainerId);

            // Verify it's stopped
            const stoppedContainer = await validateContainerExists(client, defaultRunner, { containerId: testContainerId }) as ListContainersItem;
            expect(stoppedContainer).to.be.ok;
            expect(stoppedContainer.state.toLowerCase()).to.equal('exited');
        });

        it('StartContainersCommand', async function () {
            // Start the container
            const startedContainers = await defaultRunner.getCommandRunner()(
                client.startContainers({ container: [testContainerId] })
            );

            expect(startedContainers).to.be.ok;
            expect(startedContainers).to.be.an('array');
            expect(startedContainers).to.include(testContainerId);

            // Verify it's running
            const startedContainer = await validateContainerExists(client, defaultRunner, { containerId: testContainerId }) as ListContainersItem;
            expect(startedContainer).to.be.ok;
            expect(startedContainer.state.toLowerCase()).to.equal('running');
        });

        it('RestartContainersCommand', async function () {
            // Restart the container
            const restartedContainers = await defaultRunner.getCommandRunner()(
                client.restartContainers({ container: [testContainerId], time: 1 })
            );

            expect(restartedContainers).to.be.ok;
            expect(restartedContainers).to.be.an('array');
            expect(restartedContainers).to.include(testContainerId);

            // Verify it's running
            const restartedContainer = await validateContainerExists(client, defaultRunner, { containerId: testContainerId }) as ListContainersItem;
            expect(restartedContainer).to.be.ok;
            expect(restartedContainer.state.toLowerCase()).to.equal('running');
        });

        it('StatsContainersCommand', async function () {
            // Since we can't actually run stats (it runs forever), we'll just verify the command generation
            const command = await client.statsContainers({ all: true });
            expect(command).to.be.ok;
            expect(command.command).to.be.a('string');
            expect(command.args).to.be.an('array');

            // We expect `container stats --all`
            expect(getBashCommandLine(command)).to.equal(`${client.commandName} container stats --all`);
        });

        it('RemoveContainersCommand', async function () {
            // Create a second container to test container removal
            const testContainerId2 = await defaultRunner.getCommandRunner()(
                client.runContainer({
                    imageRef: imageToTest,
                    detached: true,
                    command: ['sleep', '1'],
                    name: 'test-container-e2e-2'
                })
            ) as string;

            expect(testContainerId2).to.be.ok;
            expect(testContainerId2).to.be.a('string');

            // Remove the container
            const removedContainers = await defaultRunner.getCommandRunner()(
                client.removeContainers({
                    containers: [testContainerId2],
                    force: true
                })
            );

            expect(removedContainers).to.be.ok;
            expect(removedContainers).to.be.an('array');
            expect(removedContainers).to.include(testContainerId2);

            // Verify it was removed
            expect(await validateContainerExists(client, defaultRunner, { containerId: testContainerId2 })).to.not.be.ok;
        });

        it('PruneContainersCommand', async function () {
            // Run container prune
            const pruneResult = await defaultRunner.getCommandRunner()(
                client.pruneContainers({})
            );

            expect(pruneResult).to.be.ok;
            if (pruneResult.containersDeleted) {
                expect(pruneResult.containersDeleted).to.be.an('array');
                expect(pruneResult.containersDeleted.length).to.be.greaterThan(0);
            }
            if (pruneResult.spaceReclaimed !== undefined) {
                expect(pruneResult.spaceReclaimed).to.be.a('number');
            }
        });
    });

    // #endregion

    // #region Networks

    describe('Networks', function () {
        const testNetworkName = 'test-network-e2e';

        before('Networks', async function () {
            // Try removing the network if it exists so we don't get a name conflict
            try {
                await defaultRunner.getCommandRunner()(
                    client.removeNetworks({ networks: [testNetworkName] })
                );
            } catch (error) {
                // Ignore error if the network doesn't exist
            }

            // Create a network for testing
            await defaultRunner.getCommandRunner()(
                client.createNetwork({ name: testNetworkName })
            );
        });

        after('Networks', async function () {
            // Try removing the test network
            try {
                await defaultRunner.getCommandRunner()(
                    client.removeNetworks({ networks: [testNetworkName] })
                );
            } catch (error) {
                // Ignore error if the network doesn't exist
            }
        });

        it('CreateNetworkCommand', async function () {
            // This is already fully tested in the before('Networks') hook and the it('RemoveNetworksCommand') test
        });

        it('ListNetworksCommand', async function () {
            const network = await validateNetworkExists(client, defaultRunner, testNetworkName) as ListNetworkItem;
            expect(network).to.be.ok;

            expect(network.name).to.equal(testNetworkName);
            expect(network.labels).to.be.an('object');
        });

        it('InspectNetworksCommand', async function () {
            const networks = await defaultRunner.getCommandRunner()(
                client.inspectNetworks({ networks: [testNetworkName] })
            );

            expect(networks).to.be.ok;
            expect(networks).to.be.an('array');
            expect(networks.length).to.equal(1);

            const network = networks[0];
            expect(network.name).to.equal(testNetworkName);
            expect(network.labels).to.be.an('object');
            expect(network.raw).to.be.a('string');

            if (clientTypeToTest === 'docker') {
                // Newer Podman versions have a "driver" field but older ones do not
                expect(network.driver).to.be.a('string');
            }
        });

        it('RemoveNetworksCommand', async function () {
            // Remove the test network
            const removedNetworks = await defaultRunner.getCommandRunner()(
                client.removeNetworks({ networks: [testNetworkName] })
            );

            expect(removedNetworks).to.be.ok;
            expect(removedNetworks).to.be.an('array');
            expect(removedNetworks).to.include(testNetworkName);

            // Verify it was removed
            const networks = await defaultRunner.getCommandRunner()(
                client.listNetworks({})
            );
            expect(networks.some(n => n.name === testNetworkName)).to.be.false;
        });

        it('PruneNetworksCommand', async function () {
            const pruneResult = await defaultRunner.getCommandRunner()(
                client.pruneNetworks({})
            );

            expect(pruneResult).to.be.ok;
            if (pruneResult.networksDeleted) {
                expect(pruneResult.networksDeleted).to.be.an('array');
            }
        });
    });

    // #endregion

    // #region Volumes

    describe('Volumes', function () {
        const testVolumeName = 'test-volume-e2e';

        before('Volumes', async function () {
            // Try removing the volume if it exists so we don't get a name conflict
            try {
                await defaultRunner.getCommandRunner()(
                    client.removeVolumes({ volumes: [testVolumeName] })
                );
            } catch (error) {
                // Ignore error if the volume doesn't exist
            }

            // Create a volume for testing
            await defaultRunner.getCommandRunner()(
                client.createVolume({ name: testVolumeName })
            );
        });

        after('Volumes', async function () {
            // Try removing the test volume
            try {
                await defaultRunner.getCommandRunner()(
                    client.removeVolumes({ volumes: [testVolumeName] })
                );
            } catch (error) {
                // Ignore error if the volume doesn't exist
            }
        });

        it('CreateVolumeCommand', async function () {
            // This is already fully tested in the before('Volumes') hook and the it('RemoveVolumesCommand') test
        });

        it('ListVolumesCommand', async function () {
            const volume = await validateVolumeExists(client, defaultRunner, testVolumeName) as ListVolumeItem;
            expect(volume).to.be.ok;

            expect(volume.name).to.equal(testVolumeName);
            expect(volume.labels).to.be.an('object');
        });

        it('InspectVolumesCommand', async function () {
            const volumes = await defaultRunner.getCommandRunner()(
                client.inspectVolumes({ volumes: [testVolumeName] })
            );

            expect(volumes).to.be.ok;
            expect(volumes).to.be.an('array');
            expect(volumes.length).to.equal(1);

            const volume = volumes[0];
            expect(volume.name).to.equal(testVolumeName);
            expect(volume.driver).to.be.a('string');
            expect(volume.labels).to.be.an('object');
            expect(volume.scope).to.be.a('string');
            expect(volume.raw).to.be.a('string');
        });

        it('RemoveVolumesCommand', async function () {
            // Remove the test volume
            const removedVolumes = await defaultRunner.getCommandRunner()(
                client.removeVolumes({ volumes: [testVolumeName] })
            );

            expect(removedVolumes).to.be.ok;
            expect(removedVolumes).to.be.an('array');
            expect(removedVolumes).to.include(testVolumeName);

            // Verify it was removed
            const volumes = await defaultRunner.getCommandRunner()(
                client.listVolumes({})
            );
            expect(volumes.some(n => n.name === testVolumeName)).to.be.false;
        });

        it('PruneVolumesCommand', async function () {
            const pruneResult = await defaultRunner.getCommandRunner()(
                client.pruneVolumes({})
            );

            expect(pruneResult).to.be.ok;
            if (pruneResult.volumesDeleted) {
                expect(pruneResult.volumesDeleted).to.be.an('array');
            }
            if (pruneResult.spaceReclaimed !== undefined) {
                expect(pruneResult.spaceReclaimed).to.be.a('number');
            }
        });
    });

    // #endregion

    // #region Login/Logout

    describe('Login/Logout', function () {
        // Supply at F5 to run the login/logout tests
        const dockerHubUsername = process.env.DOCKER_HUB_USERNAME;
        const dockerHubPAT = process.env.DOCKER_HUB_PAT;

        it('LoginCommand', async function () {
            if (!dockerHubUsername || !dockerHubPAT) {
                this.skip();
            }

            const secretStream = stream.Readable.from(dockerHubPAT);
            const runnerFactory = defaultRunnerFactory({ stdInPipe: secretStream, shellProvider: new NoShell(), });
            await runnerFactory.getCommandRunner()(
                client.login({ username: dockerHubUsername, passwordStdIn: true, registry: client.defaultRegistry })
            );
        });

        it('LogoutCommand', async function () {
            if (!dockerHubUsername || !dockerHubPAT) {
                this.skip();
            }

            await defaultRunner.getCommandRunner()(
                client.logout({ registry: client.defaultRegistry })
            );
        });
    });

    // #endregion

    // #region Events

    describe('Events', function () {
        let container: string | undefined;

        before('Events', async function () {
            // Create a container so that the event stream has something to report
            container = await defaultRunner.getCommandRunner()(
                client.runContainer({
                    imageRef: 'hello-world:latest',
                    detached: true,
                })
            );
        });

        after('Events', async function () {
            // Cleanup the container created for the event stream
            if (container) {
                await defaultRunner.getCommandRunner()(
                    client.removeContainers({ containers: [container], force: true })
                );
            }
        });

        it('GetEventStreamCommand', async function () {
            const eventStream = defaultRunner.getStreamingCommandRunner()(
                client.getEventStream({ since: '1m', until: '-1s' }) // From 1m ago to 1s in the future
            );

            for await (const event of eventStream) {
                expect(event).to.be.ok;
                expect(event.action).to.be.a('string');
                expect(event.actor).to.be.ok;
                expect(event.actor.id).to.be.a('string');
                expect(event.actor.attributes).to.be.ok;
                expect(event.timestamp).to.be.an.instanceOf(Date);
                expect(event.type).to.be.a('string');
                expect(event.raw).to.be.a('string');

                break; // Break after the first event
            }
        });
    });

    // #endregion

    // #region Contexts

    describe('Contexts', function () {
        it('ListContextsCommand', async function () {
            if (clientTypeToTest !== 'docker') {
                this.skip();
            }

            const contexts = await defaultRunner.getCommandRunner()(
                client.listContexts({})
            );

            expect(contexts).to.be.ok;
            expect(contexts).to.be.an('array');
            contexts.forEach((context) => {
                expect(context.name).to.be.a('string');
                expect(context.current).to.be.a('boolean');
            });
        });

        it('RemoveContextsCommand', async function () {
            if (clientTypeToTest !== 'docker') {
                this.skip();
            }

            // Because we cannot create contexts we won't actually remove one, but we will validate the command line
            const command = await client.removeContexts({ contexts: ['test'] });
            expect(command).to.be.ok;

            expect(getBashCommandLine(command)).to.equal(`${client.commandName} context rm test --force`);
        });

        it('UseContextCommand', async function () {
            if (clientTypeToTest !== 'docker') {
                this.skip();
            }

            await defaultRunner.getCommandRunner()(
                client.useContext({ context: 'default' })
            );
        });

        it('InspectContextsCommand', async function () {
            if (clientTypeToTest !== 'docker') {
                this.skip();
            }

            const context = await defaultRunner.getCommandRunner()(
                client.inspectContexts({ contexts: ['default'] })
            );

            expect(context).to.be.ok;
            expect(context).to.be.an('array');

            context.forEach((ctx) => {
                expect(ctx.name).to.be.a('string');
                expect(ctx.raw).to.be.a('string');
            });

            expect(context.map(c => c.name)).to.include('default');
        });
    });

    // #endregion

    // #region Filesystem

    describe('Filesystem', function () {
        let containerId: string;

        before('Filesystem', async function () {
            containerId = await defaultRunner.getCommandRunner()(
                client.runContainer({
                    imageRef: 'alpine:latest',
                    detached: true,
                })
            ) as string;

            if (!containerId) {
                expect.fail('Failed to create container for filesystem tests');
            }
        });

        after('Filesystem', async function () {
            this.timeout(20000); // Increase timeout for cleanup

            if (containerId) {
                await defaultRunner.getCommandRunner()(
                    client.removeContainers({ containers: [containerId], force: true })
                );
            }
        });

        it('ListFilesCommand', async function () {
            const files = await defaultRunner.getCommandRunner()(
                client.listFiles({ container: containerId, path: '/etc' })
            );

            expect(files).to.be.ok;
            expect(files).to.be.an('array');
            files.forEach((file) => {
                expect(file.name).to.be.a('string');
                expect(file.path).to.be.a('string');
                expect(file.size).to.be.a('number');
                expect(file.type).to.be.a('number');
            });
        });

        it('StatPathCommand', async function () {
            const stats = await defaultRunner.getCommandRunner()(
                client.statPath({ container: containerId, path: '/etc/hosts' })
            ) as StatPathItem;

            expect(stats).to.be.ok;
            expect(stats.name).to.be.a('string');
            expect(stats.path).to.be.a('string');
            expect(stats.size).to.be.a('number');
            expect(stats.type).to.equal(FileType.File);
        });

        it('ReadFileCommand', async function () {
            if (clientTypeToTest !== 'docker') {
                this.skip(); // Podman doesn't support file streaming
            }

            const tarContentStream = defaultRunner.getStreamingCommandRunner()(
                client.readFile({ container: containerId, path: '/etc/hosts' })
            );

            let fileContent: string = "";
            for await (const chunk of tarContentStream) {
                expect(chunk).to.be.ok;
                expect(chunk).to.be.an.instanceOf(Buffer);
                fileContent += chunk.toString();
            }

            // The content is a tarball, but it will contain `localhost` in cleartext
            expect(fileContent).to.be.ok;
            expect(fileContent).to.include('localhost'); // "localhost" seems to always appear in /etc/hosts
        });

        it('WriteFileCommand', async function () {
            if (clientTypeToTest !== 'docker') {
                this.skip(); // Podman doesn't support file streaming
            }

            const content = 'Hello from the container!';
            let tempFilePath = path.join(os.tmpdir(), 'hello.txt');
            await fs.writeFile(tempFilePath, content);

            if (runInWsl) {
                tempFilePath = wslifyPath(tempFilePath);
            }

            await defaultRunner.getCommandRunner()(
                client.writeFile({ container: containerId, path: '/tmp/hello.txt', inputFile: tempFilePath })
            );

            // Verify the file was written
            const tarContentStream = defaultRunner.getStreamingCommandRunner()(
                client.readFile({ container: containerId, path: '/tmp/hello.txt' })
            );

            let fileContent: string = "";
            for await (const chunk of tarContentStream) {
                expect(chunk).to.be.ok;
                expect(chunk).to.be.an.instanceOf(Buffer);
                fileContent += chunk.toString();
            }

            // The content is a tarball, but it will contain the file content in cleartext
            expect(fileContent).to.be.ok;
            expect(fileContent).to.include(content);
        });
    });

    // #endregion
});

// #region Helper Methods

function getBashCommandLine(command: CommandResponseBase): string {
    const bash = new Bash();
    return `${command.command} ${bash.quote(command.args).join(' ')}`;
}

async function validateImageExists(client: IContainersClient, runner: ICommandRunnerFactory, imageRef: string): Promise<ListImagesItem | undefined> {
    const images = await runner.getCommandRunner()(
        client.listImages({ all: true })
    );

    return images.find(i => i.image.originalName?.includes(imageRef));
}

export async function validateContainerExists(client: IContainersClient, runner: ICommandRunnerFactory, reference: { containerId?: string, containerName?: string }): Promise<ListContainersItem | undefined> {
    const containers = await runner.getCommandRunner()(
        client.listContainers({ all: true })
    );

    if (reference.containerId) {
        return containers.find(c => c.id === reference.containerId);
    } else if (reference.containerName) {
        return containers.find(c => c.name === reference.containerName);
    }

    throw new Error('Either containerId or containerName must be provided');
}

async function validateNetworkExists(client: IContainersClient, runner: ICommandRunnerFactory, networkName: string): Promise<ListNetworkItem | undefined> {
    const networks = await runner.getCommandRunner()(
        client.listNetworks({})
    );

    return networks.find(n => n.name === networkName);
}

async function validateVolumeExists(client: IContainersClient, runner: ICommandRunnerFactory, volumeName: string): Promise<ListVolumeItem | undefined> {
    const volumes = await runner.getCommandRunner()(
        client.listVolumes({})
    );

    return volumes.find(v => v.name === volumeName);
}

// #endregion

const TestDockerfileContent = `
FROM alpine:latest
EXPOSE 8080
`;
