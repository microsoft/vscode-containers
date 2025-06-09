/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DockerComposeClient } from '../clients/DockerComposeClient/DockerComposeClient';
import { ShellStreamCommandRunnerFactory, ShellStreamCommandRunnerOptions } from '../commandRunners/shellStream';
import { WslShellCommandRunnerFactory, WslShellCommandRunnerOptions } from '../commandRunners/wslStream';
import { IContainerOrchestratorClient } from '../contracts/ContainerOrchestratorClient';
import { ICommandRunnerFactory } from '../contracts/CommandRunner';
import { wslifyPath } from '../utils/wslifyPath';
import { DockerClient } from '../clients/DockerClient/DockerClient';
import { validateContainerExists } from './ContainersClientE2E.test';

// Modify the below options to configure the tests
const runInWsl: boolean = !!process.env.RUN_IN_WSL || false; // Set to true if running in WSL

// No need to modify below this
describe('(integration) ContainerOrchestratorClientE2E', function () {

    // #region Test Setup

    let client: IContainerOrchestratorClient;
    let containerClient: DockerClient;
    let defaultRunner: ICommandRunnerFactory;
    let defaultRunnerFactory: (options: ShellStreamCommandRunnerOptions) => ICommandRunnerFactory;
    let composeFilePath: string;
    let composeDir: string;
    let composeProfileFilePath: string;

    this.timeout(10000); // Set a longer timeout for integration tests

    before(async function () {
        client = new DockerComposeClient();
        containerClient = new DockerClient(); // Used for validating that the containers are created and removed correctly

        if (!runInWsl) {
            defaultRunnerFactory = (options: ShellStreamCommandRunnerOptions) => new ShellStreamCommandRunnerFactory(options);
        } else {
            defaultRunnerFactory = (options: WslShellCommandRunnerOptions) => new WslShellCommandRunnerFactory(options);
        }

        defaultRunner = defaultRunnerFactory({ strict: true, });

        // Set up paths for test docker-compose file
        composeDir = path.resolve(__dirname, 'buildContext');
        composeFilePath = path.resolve(composeDir, 'docker-compose.yml');
        composeProfileFilePath = path.resolve(composeDir, 'docker-compose.profiles.yml');

        // Create the test docker-compose.yml file
        await fs.mkdir(composeDir, { recursive: true });
        await fs.writeFile(composeFilePath, TestComposeFileContent);
        await fs.writeFile(composeProfileFilePath, TestComposeFileContentWithProfiles);

        if (runInWsl) {
            composeDir = wslifyPath(composeDir);
            composeFilePath = wslifyPath(composeFilePath);
            composeProfileFilePath = wslifyPath(composeProfileFilePath);
        }
    });

    after(async function () {
        // Ensure all services are down after tests complete
        try {
            await defaultRunner.getCommandRunner()(
                client.down({
                    files: [composeFilePath],
                    removeVolumes: true
                })
            );
        } catch (error) {
            // Ignore errors during cleanup
        }
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
    });

    // #endregion

    // #region Up Command

    describe('Up', function () {
        it('UpCommand', async function () {
            // Bring up the services
            await defaultRunner.getCommandRunner()(
                client.up({
                    files: [composeFilePath],
                    detached: true,
                })
            );

            // Verify the containers are created
            expect(await validateContainerExists(containerClient, defaultRunner, { containerName: 'buildcontext-frontend-1' })).to.be.ok;
            expect(await validateContainerExists(containerClient, defaultRunner, { containerName: 'buildcontext-backend-1' })).to.be.ok;
        });
    });

    // #endregion

    // #region Down Command

    describe('Down', function () {
        before('Down', async function () {
            // Ensure services are up before down test
            await defaultRunner.getCommandRunner()(
                client.up({
                    files: [composeFilePath],
                    detached: true,
                })
            );
        });

        it('DownCommand', async function () {
            // Bring down the services
            await defaultRunner.getCommandRunner()(
                client.down({
                    files: [composeFilePath],
                    removeVolumes: true,
                })
            );

            expect(await validateContainerExists(containerClient, defaultRunner, { containerName: 'buildcontext-frontend-1' })).to.be.not.ok;
            expect(await validateContainerExists(containerClient, defaultRunner, { containerName: 'buildcontext-backend-1' })).to.be.not.ok;
        });
    });

    // #endregion

    // #region Start Command

    describe('Start', function () {
        before('Start', async function () {
            // Create services but make sure they're stopped
            await defaultRunner.getCommandRunner()(
                client.up({
                    files: [composeFilePath],
                    detached: true,
                })
            );

            await defaultRunner.getCommandRunner()(
                client.stop({
                    files: [composeFilePath],
                })
            );
        });

        it('StartCommand', async function () {
            // Start the services
            await defaultRunner.getCommandRunner()(
                client.start({
                    files: [composeFilePath],
                })
            );

            // Verify the containers are running
            const service1 = await validateContainerExists(containerClient, defaultRunner, { containerName: 'buildcontext-frontend-1' });
            const service2 = await validateContainerExists(containerClient, defaultRunner, { containerName: 'buildcontext-backend-1' });

            expect(service1).to.be.ok;
            expect(service2).to.be.ok;

            // Validate that they are specifically running
            expect(service1?.state).to.equal('running');
            expect(service2?.state).to.equal('running');
        });
    });

    // #endregion

    // #region Stop Command

    describe('Stop', function () {
        before('Stop', async function () {
            // Ensure services are up before stop test
            await defaultRunner.getCommandRunner()(
                client.up({
                    files: [composeFilePath],
                    detached: true,
                })
            );
        });

        it('StopCommand', async function () {
            // Stop the services
            await defaultRunner.getCommandRunner()(
                client.stop({
                    files: [composeFilePath],
                })
            );

            // Verify the containers are stopped
            const service1 = await validateContainerExists(containerClient, defaultRunner, { containerName: 'buildcontext-frontend-1' });
            const service2 = await validateContainerExists(containerClient, defaultRunner, { containerName: 'buildcontext-backend-1' });

            expect(service1).to.be.ok;
            expect(service2).to.be.ok;

            // Validate that they are specifically stopped
            expect(service1?.state).to.equal('exited');
            expect(service2?.state).to.equal('exited');
        });
    });

    // #endregion

    // #region Restart Command

    describe('Restart', function () {
        before('Restart', async function () {
            // Ensure services are up before restart test
            await defaultRunner.getCommandRunner()(
                client.up({
                    files: [composeFilePath],
                    detached: true,
                })
            );
        });

        it('RestartCommand', async function () {
            // Restart the services
            await defaultRunner.getCommandRunner()(
                client.restart({
                    files: [composeFilePath],
                })
            );

            // Verify the containers are running
            const service1 = await validateContainerExists(containerClient, defaultRunner, { containerName: 'buildcontext-frontend-1' });
            const service2 = await validateContainerExists(containerClient, defaultRunner, { containerName: 'buildcontext-backend-1' });

            expect(service1).to.be.ok;
            expect(service2).to.be.ok;

            // Validate that they are specifically running
            expect(service1?.state).to.equal('running');
            expect(service2?.state).to.equal('running');
        });
    });

    // #endregion

    // #region Logs Command

    describe('Logs', function () {
        before('Logs', async function () {
            // Ensure services are up before logs test
            await defaultRunner.getCommandRunner()(
                client.up({
                    files: [composeFilePath],
                    detached: true,
                })
            );
        });

        it('LogsCommand', async function () {
            // Get logs without following
            const logsStream = defaultRunner.getStreamingCommandRunner()(
                client.logs({
                    files: [composeFilePath],
                    follow: false,
                    tail: 10,
                })
            );

            let logsOutput = '';
            for await (const chunk of logsStream) {
                expect(chunk).to.be.a('string');
                logsOutput += chunk;
            }

            // Check if the logs contain the expected output
            expect(logsOutput).to.include('Log entry for testing');
        });
    });

    // #endregion

    // #region Config Command

    describe('Config', function () {
        it('ConfigServices', async function () {
            const services = await defaultRunner.getCommandRunner()(
                client.config({
                    files: [composeFilePath],
                    configType: 'services',
                })
            );

            expect(services).to.be.an('array');
            expect(services).to.include('frontend');
            expect(services).to.include('backend');
        });

        it('ConfigImages', async function () {
            const images = await defaultRunner.getCommandRunner()(
                client.config({
                    files: [composeFilePath],
                    configType: 'images',
                })
            );

            expect(images).to.be.an('array');
            expect(images).to.include('alpine:latest');
        });

        it('ConfigProfiles', async function () {
            // The test docker-compose.yml doesn't define profiles, but the command should still work
            const profiles = await defaultRunner.getCommandRunner()(
                client.config({
                    files: [composeFilePath, composeProfileFilePath],
                    configType: 'profiles',
                })
            );

            expect(profiles).to.be.an('array');
            expect(profiles).to.include('test-profile');
        });

        it('ConfigVolumes', async function () {
            // The test docker-compose.yml doesn't define volumes, but the command should still work
            const volumes = await defaultRunner.getCommandRunner()(
                client.config({
                    files: [composeFilePath],
                    configType: 'volumes',
                })
            );

            expect(volumes).to.be.an('array');
            expect(volumes).to.include('test-volume');
        });
    });

    // #endregion
});

const TestComposeFileContent = `
services:
  frontend:
    image: alpine:latest
    volumes:
      - test-volume:/test-volume

  backend:
    image: alpine:latest
    entrypoint: ["echo", "Log entry for testing"]

volumes:
  test-volume:
`;

const TestComposeFileContentWithProfiles = `
services:
  frontend:
    profiles:
      - test-profile

  backend:
    profiles:
      - test-profile
`;
