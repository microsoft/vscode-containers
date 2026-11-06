/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeDataProvider, createTestActionContext, IActionContext, UserCancelledError } from '@microsoft/vscode-azext-utils';
import { DockerComposeClient, normalizeCommandResponseLike, VoidCommandResponse } from '@microsoft/vscode-container-client';
import { NoShell } from '@microsoft/vscode-processutils';
import assert from 'assert';
import { expect } from 'chai';
import { mock, Mock } from 'node:test';
import * as path from 'path';
import * as vscode from 'vscode';
import { composeGroupDown, composeGroupLogs, getComposeEnvFile, getComposeFiles, getComposeProjectName, getComposeWorkingDirectory } from '../../commands/containers/composeGroup';
import { ext } from '../../extensionVariables';
import { OrchestratorRuntimeManager } from '../../runtimes/OrchestratorRuntimeManager';
import { TaskCommandRunnerFactory } from '../../runtimes/runners/TaskCommandRunnerFactory';
import { ContainerGroupTreeItem } from '../../tree/containers/ContainerGroupTreeItem';
import { ContainerTreeItem } from '../../tree/containers/ContainerTreeItem';

suite("(unit) composeGroup", () => {
    suite("composeGroupLogs", () => {
        const workingDirectory = vscode.Uri.file(path.resolve('compose project')).fsPath;
        const files = [path.join(workingDirectory, 'compose.yaml'), path.join(workingDirectory, 'compose.override.yaml')];
        const envFile = path.join(workingDirectory, '.env.local');
        const labels = {
            'com.docker.compose.project': 'testproject',
            'com.docker.compose.project.working_dir': workingDirectory,
            'com.docker.compose.project.config_files': files.join(','),
            'com.docker.compose.project.environment_file': envFile,
        };
        let context: IActionContext;
        let node: ContainerGroupTreeItem;
        let commands: VoidCommandResponse[];
        let inspect: Mock<() => Promise<{ labels: { [key: string]: string } }[]>>;
        let originalContainersTree: typeof ext.containersTree;
        let originalOrchestratorManager: typeof ext.orchestratorManager;

        setup(async () => {
            context = await createTestActionContext();
            commands = [];
            const container = new ContainerTreeItem(undefined, {
                id: 'test-container',
                name: 'test-container',
                labels,
                image: { originalName: 'test-image' },
                ports: [],
                networks: [],
                createdAt: new Date(0),
                state: 'running',
                showFiles: false,
            });
            const group: Pick<ContainerGroupTreeItem, 'label' | 'ChildTreeItems'> = {
                label: 'testproject',
                ChildTreeItems: [container],
            };
            node = group as ContainerGroupTreeItem;
            originalContainersTree = ext.containersTree;
            originalOrchestratorManager = ext.orchestratorManager;
            ext.containersTree = new AzExtTreeDataProvider(node, 'test');
            ext.orchestratorManager = new OrchestratorRuntimeManager();

            inspect = mock.fn(async () => [{ labels }]);
            mock.method(ext, 'runWithDefaults', inspect);
            mock.method(ext.orchestratorManager, 'getClient', async () => new DockerComposeClient());
            mock.method(TaskCommandRunnerFactory.prototype, 'getCommandRunner', () => async response => {
                commands.push(await normalizeCommandResponseLike(response));
                return undefined as never;
            });
            mock.method(vscode.workspace, 'getWorkspaceFolder', () => undefined);
            const config = vscode.workspace.getConfiguration('containers');
            mock.method(vscode.workspace, 'getConfiguration', () => ({
                ...config,
                inspect: () => ({
                    key: 'commands.composeLogs',
                    // eslint-disable-next-line no-template-curly-in-string
                    globalValue: 'cd "${workspaceFolder}" && ${composeCommand} ${configurationFile} ${projectName} ${environmentFile} logs --tail 42',
                }),
            }));
        });

        teardown(() => {
            mock.reset();
            ext.containersTree.dispose();
            ext.orchestratorManager.dispose();
            ext.containersTree = originalContainersTree;
            ext.orchestratorManager = originalOrchestratorManager;
        });

        for (const fromPalette of [true, false]) {
            test(`Runs logs from the ${fromPalette ? 'Command Palette' : 'context menu'}`, async () => {
                const refresh = mock.method(ext.containersTree, 'refresh', async () => undefined);
                const picker = mock.method(ext.containersTree, 'showTreeItemPicker', async () => {
                    assert.strictEqual(refresh.mock.callCount(), 1);
                    return node;
                });
                await composeGroupLogs(context, fromPalette ? undefined : node);

                assert.strictEqual(refresh.mock.callCount(), fromPalette ? 1 : 0);
                assert.strictEqual(picker.mock.callCount(), fromPalette ? 1 : 0);
                assert.strictEqual(inspect.mock.callCount(), 1);
                assert.deepStrictEqual(commands, [{
                    command: `cd "${workingDirectory}" && docker compose -f "${files[0]}" -f "${files[1]}" -p "testproject" --env-file "${envFile}" logs --tail 42`,
                    args: undefined,
                }]);
            });
        }

        test("Passes multiple environment files separately to Compose Down", async () => {
            const envFiles = [path.join(workingDirectory, '.env'), path.join(workingDirectory, 'override env')];
            inspect.mock.mockImplementation(async () => [{
                labels: { ...labels, 'com.docker.compose.project.environment_file': envFiles.join(',') },
            }]);

            await composeGroupDown(context, node);

            assert.strictEqual(commands.length, 1);
            assert.deepStrictEqual(new NoShell(false).quote(commands[0].args), [
                'compose', '--file', files[0], '--file', files[1],
                '--env-file', envFiles[0], '--env-file', envFiles[1],
                '--project-name', 'testproject', 'down',
            ]);
        });

        test("Keeps a comma-containing environment filename intact in group commands", async () => {
            const commaFile = path.join(workingDirectory, 'base,local.env');
            inspect.mock.mockImplementation(async () => [{
                labels: { ...labels, 'com.docker.compose.project.environment_file': commaFile },
            }]);

            await composeGroupDown(context, node);

            assert.deepStrictEqual(new NoShell(false).quote(commands[0].args), [
                'compose', '--file', files[0], '--file', files[1],
                '--env-file', commaFile, '--project-name', 'testproject', 'down',
            ]);
        });

        test("Includes each environment file in customized logs commands", async () => {
            const envFiles = [path.join(workingDirectory, '.env'), path.join(workingDirectory, 'override env')];
            inspect.mock.mockImplementation(async () => [{
                labels: { ...labels, 'com.docker.compose.project.environment_file': envFiles.join(',') },
            }]);

            await composeGroupLogs(context, node);

            assert.deepStrictEqual(commands, [{
                command: `cd "${workingDirectory}" && docker compose -f "${files[0]}" -f "${files[1]}" -p "testproject" --env-file "${envFiles[0]}" --env-file "${envFiles[1]}" logs --tail 42`,
                args: undefined,
            }]);
        });

        test("Preserves separate environment files in the default logs template", async () => {
            const envFiles = [path.join(workingDirectory, 'override env'), path.join(workingDirectory, '.env')];
            inspect.mock.mockImplementation(async () => [{
                labels: { ...labels, 'com.docker.compose.project.environment_file': envFiles.join(',') },
            }]);
            const config = vscode.workspace.getConfiguration('containers');
            mock.method(vscode.workspace, 'getConfiguration', () => ({
                ...config,
                inspect: () => ({
                    key: 'commands.composeLogs',
                    // eslint-disable-next-line no-template-curly-in-string
                    defaultValue: '${composeCommand} ${configurationFile} ${projectName} ${environmentFile} logs --tail 42',
                }),
            }));

            await composeGroupLogs(context, node);

            assert.strictEqual(commands[0].command, 'docker');
            assert.deepStrictEqual(new NoShell(false).quote(commands[0].args), [
                'compose', '-f', files[0], '-f', files[1], '-p', 'testproject',
                '--env-file', envFiles[0], '--env-file', envFiles[1], 'logs', '--tail', '42',
            ]);
        });

        test("Does not run logs when group selection is cancelled", async () => {
            mock.method(ext.containersTree, 'refresh', async () => undefined);
            mock.method(ext.containersTree, 'showTreeItemPicker', async () => { throw new UserCancelledError(); });
            await assert.rejects(composeGroupLogs(context), UserCancelledError);

            assert.strictEqual(inspect.mock.callCount(), 0);
            assert.deepStrictEqual(commands, []);
        });

        test("Reports missing project information without running logs", async () => {
            inspect.mock.mockImplementation(async () => [{ labels: {} }]);

            await assert.rejects(composeGroupLogs(context, node), /Unable to determine compose project info/);

            assert.strictEqual(context.errorHandling.suppressReportIssue, true);
            assert.deepStrictEqual(commands, []);
        });
    });

    suite("getComposeFiles", () => {
        test("Returns all files when multiple absolute config files are present", () => {
            // Regression test for https://github.com/microsoft/vscode-containers/issues/522
            const labels = {
                'com.docker.compose.project.config_files': '/abs/path/docker-compose.base.yml,/abs/path/docker-compose.local.yml',
            };

            const result = getComposeFiles(labels);

            expect(result).to.deep.equal([
                '/abs/path/docker-compose.base.yml',
                '/abs/path/docker-compose.local.yml',
            ]);
        });

        test("Returns three files when three absolute config files are present", () => {
            const labels = {
                'com.docker.compose.project.config_files': '/a/one.yml,/a/two.yml,/a/three.yml',
            };

            const result = getComposeFiles(labels);

            expect(result).to.deep.equal(['/a/one.yml', '/a/two.yml', '/a/three.yml']);
        });

        test("Returns a single absolute file unchanged", () => {
            const labels = {
                'com.docker.compose.project.config_files': '/abs/path/docker-compose.yml',
            };

            const result = getComposeFiles(labels);

            expect(result).to.deep.equal(['/abs/path/docker-compose.yml']);
        });

        test("Reduces relative paths to their basename", () => {
            const labels = {
                'com.docker.compose.project.config_files': 'subdir/docker-compose.base.yml,subdir/docker-compose.local.yml',
            };

            const result = getComposeFiles(labels);

            expect(result).to.deep.equal(['docker-compose.base.yml', 'docker-compose.local.yml']);
        });

        // Node's `path` resolves to `path.win32` only on Windows, so absolute/relative
        // Windows-path handling in getComposeFiles is only correct on a Windows host
        // (which is also the only host where a Windows docker engine emits such labels).
        if (process.platform === 'win32') {
            test("Returns all files when multiple absolute Windows config files are present", () => {
                // Regression test for https://github.com/microsoft/vscode-containers/issues/522
                const labels = {
                    'com.docker.compose.project.config_files': 'C:\\path\\docker-compose.base.yml,C:\\path\\docker-compose.local.yml',
                };

                const result = getComposeFiles(labels);

                expect(result).to.deep.equal([
                    'C:\\path\\docker-compose.base.yml',
                    'C:\\path\\docker-compose.local.yml',
                ]);
            });

            test("Returns a single absolute Windows file unchanged", () => {
                const labels = {
                    'com.docker.compose.project.config_files': 'C:\\path\\docker-compose.yml',
                };

                const result = getComposeFiles(labels);

                expect(result).to.deep.equal(['C:\\path\\docker-compose.yml']);
            });

            test("Reduces relative Windows paths to their basename", () => {
                const labels = {
                    'com.docker.compose.project.config_files': 'subdir\\docker-compose.base.yml,subdir\\docker-compose.local.yml',
                };

                const result = getComposeFiles(labels);

                expect(result).to.deep.equal(['docker-compose.base.yml', 'docker-compose.local.yml']);
            });
        }

        test("Returns undefined when the config files label is absent", () => {
            const result = getComposeFiles({});

            expect(result).to.be.undefined;
        });
    });

    suite("getComposeEnvFile", () => {
        test("Preserves the order of multiple environment files", () => {
            expect(getComposeEnvFile({
                'com.docker.compose.project.environment_file': '/project/override env,/project/.env',
            })).to.deep.equal(['/project/override env', '/project/.env']);
        });

        test("Preserves Windows paths and spaces", () => {
            expect(getComposeEnvFile({
                'com.docker.compose.project.environment_file': 'C:\\project dir\\.env,C:\\project dir\\override.env',
            })).to.deep.equal(['C:\\project dir\\.env', 'C:\\project dir\\override.env']);
        });

        test("Preserves commas within each of several absolute paths", () => {
            expect(getComposeEnvFile({
                'com.docker.compose.project.environment_file': '/project/base,local.env,/project/override,local.env',
            })).to.deep.equal(['/project/base,local.env', '/project/override,local.env']);
        });

        test("Preserves a relative single filename containing a comma", () => {
            expect(getComposeEnvFile({
                'com.docker.compose.project.environment_file': 'base,local.env',
            })).to.equal('base,local.env');
        });

        test("Separates absolute UNC environment paths", () => {
            expect(getComposeEnvFile({
                'com.docker.compose.project.environment_file': '\\\\server\\share\\base,local.env,\\\\server\\share\\override.env',
            })).to.deep.equal(['\\\\server\\share\\base,local.env', '\\\\server\\share\\override.env']);
        });

        test("Omits empty environment file labels", () => {
            expect(getComposeEnvFile({ 'com.docker.compose.project.environment_file': '' })).to.be.undefined;
        });
    });

    suite("other label accessors", () => {
        const labels = {
            'com.docker.compose.project': 'myproject',
            'com.docker.compose.project.working_dir': '/abs/path',
            'com.docker.compose.project.environment_file': '/abs/path/.env.local',
        };

        test("getComposeProjectName returns the project name", () => {
            expect(getComposeProjectName(labels)).to.equal('myproject');
        });

        test("getComposeWorkingDirectory returns the working directory", () => {
            expect(getComposeWorkingDirectory(labels)).to.equal('/abs/path');
        });

        test("getComposeEnvFile returns the environment file", () => {
            expect(getComposeEnvFile(labels)).to.equal('/abs/path/.env.local');
        });

        test("Accessors return undefined when their label is absent", () => {
            expect(getComposeProjectName({})).to.be.undefined;
            expect(getComposeWorkingDirectory({})).to.be.undefined;
            expect(getComposeEnvFile({})).to.be.undefined;
        });
    });
});
