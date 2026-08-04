/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { getComposeProfilesForContainer, getComposeSourceFiles } from '../../tree/containers/composeProfiles';
import { ContainerTreeItem } from '../../tree/containers/ContainerTreeItem';

suite("(unit) composeProfiles", () => {
    suite("getComposeSourceFiles", () => {
        test("Reduces relative paths to their basename", () => {
            const labels = {
                'com.docker.compose.project.config_files': 'subdir/docker-compose.base.yml,subdir/docker-compose.local.yml',
            };

            const result = getComposeSourceFiles(labels);
            expect(result).to.deep.equal(['docker-compose.base.yml', 'docker-compose.local.yml']);
        });

        test("Returns absolute paths unchanged", () => {
            const labels = {
                'com.docker.compose.project.config_files': '/abs/docker-compose.yml',
            };

            const result = getComposeSourceFiles(labels);
            expect(result).to.deep.equal(['/abs/docker-compose.yml']);
        });
    });

    suite("getComposeProfilesForContainer", () => {
        test("Returns profiles assigned to the container service", () => {
            const container = Object.create(ContainerTreeItem.prototype) as ContainerTreeItem;
            Object.defineProperty(container, 'labels', {
                value: { 'com.docker.compose.service': 'web' }
            });

            const serviceProfiles = new Map<string, string[]>([
                ['web', ['frontend', 'debug']],
                ['db', ['backend']]
            ]);

            const profiles = getComposeProfilesForContainer(container, serviceProfiles);
            expect(profiles).to.deep.equal(['frontend', 'debug']);
        });

        test("Returns empty array when service has no assigned profiles", () => {
            const container = Object.create(ContainerTreeItem.prototype) as ContainerTreeItem;
            Object.defineProperty(container, 'labels', {
                value: { 'com.docker.compose.service': 'cache' }
            });

            const serviceProfiles = new Map<string, string[]>([
                ['web', ['frontend']]
            ]);

            const profiles = getComposeProfilesForContainer(container, serviceProfiles);
            expect(profiles).to.deep.equal([]);
        });
    });
});
