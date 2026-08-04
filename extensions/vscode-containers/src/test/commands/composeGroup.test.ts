/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { findContainerWithComposeConfig, getComposeEnvFile, getComposeFiles, getComposeProjectName, getComposeWorkingDirectory, getProjectLabel } from '../../commands/containers/composeGroup';
import { ComposeProfileGroupTreeItem } from '../../tree/containers/ComposeProfileGroupTreeItem';
import { ContainerGroupTreeItem } from '../../tree/containers/ContainerGroupTreeItem';
import { ContainerTreeItem } from '../../tree/containers/ContainerTreeItem';

suite("(unit) composeGroup", () => {
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

    suite("profile sub-group utilities", () => {
        test("getProjectLabel returns parent label for ComposeProfileGroupTreeItem", () => {
            const parent = Object.create(ContainerGroupTreeItem.prototype) as ContainerGroupTreeItem;
            Object.defineProperty(parent, 'label', { value: 'my-compose-project' });

            const profileNode = Object.create(ComposeProfileGroupTreeItem.prototype) as ComposeProfileGroupTreeItem;
            Object.defineProperty(profileNode, 'label', { value: 'dev-profile' });
            Object.defineProperty(profileNode, 'parent', { value: parent });

            expect(getProjectLabel(profileNode)).to.equal('my-compose-project');
            expect(getProjectLabel(parent)).to.equal('my-compose-project');
        });

        test("findContainerWithComposeConfig searches direct children and profile sub-groups", () => {
            const containerWithLabels = Object.create(ContainerTreeItem.prototype) as ContainerTreeItem;
            Object.defineProperty(containerWithLabels, 'labels', {
                value: { 'com.docker.compose.project.config_files': '/path/to/docker-compose.yml' }
            });

            const containerWithoutLabels = Object.create(ContainerTreeItem.prototype) as ContainerTreeItem;
            Object.defineProperty(containerWithoutLabels, 'labels', { value: {} });

            const profileGroup = Object.create(ComposeProfileGroupTreeItem.prototype) as ComposeProfileGroupTreeItem;
            Object.defineProperty(profileGroup, 'ChildTreeItems', { value: [containerWithoutLabels, containerWithLabels] });

            const rootGroup = Object.create(ContainerGroupTreeItem.prototype) as ContainerGroupTreeItem;
            Object.defineProperty(rootGroup, 'ChildTreeItems', { value: [profileGroup] });

            const result = findContainerWithComposeConfig(rootGroup);
            expect(result).to.equal(containerWithLabels);
        });
    });
});
