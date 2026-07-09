/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getComposeEnvFile, getComposeFiles, getComposeProjectName, getComposeWorkingDirectory } from '../../commands/containers/composeGroup';

suite("(unit) composeGroup", () => {
    suite("getComposeFiles", () => {
        test("Returns all files when multiple absolute config files are present", () => {
            // Regression test for https://github.com/microsoft/vscode-containers/issues/522
            const labels = {
                'com.docker.compose.project.config_files': '/abs/path/docker-compose.base.yml,/abs/path/docker-compose.local.yml',
            };

            const result = getComposeFiles(labels);

            assert.deepStrictEqual(result, [
                '/abs/path/docker-compose.base.yml',
                '/abs/path/docker-compose.local.yml',
            ]);
        });

        test("Returns three files when three absolute config files are present", () => {
            const labels = {
                'com.docker.compose.project.config_files': '/a/one.yml,/a/two.yml,/a/three.yml',
            };

            const result = getComposeFiles(labels);

            assert.deepStrictEqual(result, ['/a/one.yml', '/a/two.yml', '/a/three.yml']);
        });

        test("Returns a single absolute file unchanged", () => {
            const labels = {
                'com.docker.compose.project.config_files': '/abs/path/docker-compose.yml',
            };

            const result = getComposeFiles(labels);

            assert.deepStrictEqual(result, ['/abs/path/docker-compose.yml']);
        });

        test("Reduces relative paths to their basename", () => {
            const labels = {
                'com.docker.compose.project.config_files': 'subdir/docker-compose.base.yml,subdir/docker-compose.local.yml',
            };

            const result = getComposeFiles(labels);

            assert.deepStrictEqual(result, ['docker-compose.base.yml', 'docker-compose.local.yml']);
        });

        test("Returns undefined when the config files label is absent", () => {
            const result = getComposeFiles({});

            assert.strictEqual(result, undefined);
        });
    });

    suite("other label accessors", () => {
        const labels = {
            'com.docker.compose.project': 'myproject',
            'com.docker.compose.project.working_dir': '/abs/path',
            'com.docker.compose.project.environment_file': '/abs/path/.env.local',
        };

        test("getComposeProjectName returns the project name", () => {
            assert.strictEqual(getComposeProjectName(labels), 'myproject');
        });

        test("getComposeWorkingDirectory returns the working directory", () => {
            assert.strictEqual(getComposeWorkingDirectory(labels), '/abs/path');
        });

        test("getComposeEnvFile returns the environment file", () => {
            assert.strictEqual(getComposeEnvFile(labels), '/abs/path/.env.local');
        });

        test("Accessors return undefined when their label is absent", () => {
            assert.strictEqual(getComposeProjectName({}), undefined);
            assert.strictEqual(getComposeWorkingDirectory({}), undefined);
            assert.strictEqual(getComposeEnvFile({}), undefined);
        });
    });
});
