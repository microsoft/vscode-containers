/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { getComposeProfilesForContainer } from '../../../tree/containers/composeProfiles';
import { ContainerTreeItem } from '../../../tree/containers/ContainerTreeItem';
import { ComposeServiceLabel } from '../../../utils/composeLabels';

suite("(unit) composeProfiles", () => {
    suite("getComposeProfilesForContainer", () => {
        test("Returns profiles assigned to the container service", () => {
            const container = Object.create(ContainerTreeItem.prototype) as ContainerTreeItem;
            Object.defineProperty(container, 'labels', {
                value: { [ComposeServiceLabel]: 'web' }
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
                value: { [ComposeServiceLabel]: 'cache' }
            });

            const serviceProfiles = new Map<string, string[]>([
                ['web', ['frontend']]
            ]);

            const profiles = getComposeProfilesForContainer(container, serviceProfiles);
            expect(profiles).to.deep.equal([]);
        });
    });
});
