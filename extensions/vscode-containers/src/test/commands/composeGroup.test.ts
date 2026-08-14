/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { expect } from 'chai';
import { findContainerWithComposeConfig, getProjectLabel, pickComposeProfileCommandScope, resolveComposeProfileArguments } from '../../commands/containers/composeGroup';
import { ComposeProfileGroupTreeItem } from '../../tree/containers/ComposeProfileGroupTreeItem';
import { ContainerGroupTreeItem } from '../../tree/containers/ContainerGroupTreeItem';
import { ContainerTreeItem } from '../../tree/containers/ContainerTreeItem';
import { ComposeConfigFilesLabel } from '../../utils/composeLabels';

function createMockProfileGroup(profileName: string | undefined, services: string[], exclusiveServices: string[]): ComposeProfileGroupTreeItem {
    const node = Object.create(ComposeProfileGroupTreeItem.prototype) as ComposeProfileGroupTreeItem;
    Object.defineProperty(node, 'profileName', { value: profileName });
    Object.defineProperty(node, 'label', { value: profileName ?? 'Default' });
    node.getServiceNames = () => services;
    node.getExclusiveServiceNames = () => exclusiveServices;
    return node;
}

function createMockContext(pickIndex: number, verifyPicks?: (picks: IAzureQuickPickItem<'profile' | 'services' | 'exclusive'>[]) => void): IActionContext {
    return {
        errorHandling: {},
        ui: {
            showQuickPick: async (picks: IAzureQuickPickItem<'profile' | 'services' | 'exclusive'>[]) => {
                if (verifyPicks) {
                    verifyPicks(picks);
                }
                return picks[pickIndex];
            }
        }
    } as unknown as IActionContext;
}

suite("(unit) composeGroup", () => {
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
                value: { [ComposeConfigFilesLabel]: '/path/to/docker-compose.yml' }
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

    suite("profile scoping and argument resolution", () => {
        test("pickComposeProfileCommandScope presents correct picks and descriptions with exclusive services", async () => {
            const node = createMockProfileGroup('backend', ['api', 'worker', 'db'], ['worker', 'db']);
            const context = createMockContext(0, (picks) => {
                expect(picks.length).to.equal(3);
                expect(picks[0].data).to.equal('profile');
                expect(picks[0].description).to.include('--profile backend');
                expect(picks[1].data).to.equal('services');
                expect(picks[1].description).to.include('api worker db');
                expect(picks[2].data).to.equal('exclusive');
                expect(picks[2].description).to.include('worker db');
            });

            const scope = await pickComposeProfileCommandScope(context, node, 'down');
            expect(scope).to.equal('profile');
        });

        test("pickComposeProfileCommandScope shows warning description when no exclusive services exist", async () => {
            const node = createMockProfileGroup('frontend', ['web', 'proxy'], []);
            const context = createMockContext(2, (picks) => {
                expect(picks[2].description).to.include('No services are exclusive to this profile');
            });

            const scope = await pickComposeProfileCommandScope(context, node, 'start');
            expect(scope).to.equal('exclusive');
        });

        test("resolveComposeProfileArguments bypasses prompt for standard container groups", async () => {
            const rootGroup = Object.create(ContainerGroupTreeItem.prototype) as ContainerGroupTreeItem;
            const context = createMockContext(0, () => {
                expect.fail("Should not invoke QuickPick for standard container group");
            });

            const result = await resolveComposeProfileArguments(context, rootGroup, 'down');
            expect(result.profileArg).to.be.undefined;
            expect(result.servicesArg).to.be.undefined;
        });

        test("resolveComposeProfileArguments resolves --profile scope", async () => {
            const node = createMockProfileGroup('debug', ['app', 'tester'], ['tester']);
            const context = createMockContext(0); // Pick 0: 'profile'

            const result = await resolveComposeProfileArguments(context, node, 'up');
            expect(result.profileArg).to.deep.equal(['debug']);
            expect(result.servicesArg).to.be.undefined;
        });

        test("resolveComposeProfileArguments resolves specific profile services scope", async () => {
            const node = createMockProfileGroup('debug', ['app', 'tester'], ['tester']);
            const context = createMockContext(1); // Pick 1: 'services'

            const result = await resolveComposeProfileArguments(context, node, 'restart');
            expect(result.profileArg).to.be.undefined;
            expect(result.servicesArg).to.deep.equal(['app', 'tester']);
        });

        test("resolveComposeProfileArguments resolves exclusive services scope", async () => {
            const node = createMockProfileGroup('debug', ['app', 'tester'], ['tester']);
            const context = createMockContext(2); // Pick 2: 'exclusive'

            const result = await resolveComposeProfileArguments(context, node, 'stop');
            expect(result.profileArg).to.be.undefined;
            expect(result.servicesArg).to.deep.equal(['tester']);
        });

        test("resolveComposeProfileArguments throws error when picking exclusive scope with no exclusive services", async () => {
            const node = createMockProfileGroup('shared-only', ['redis'], []);
            const context = createMockContext(2); // Pick 2: 'exclusive'

            try {
                await resolveComposeProfileArguments(context, node, 'down');
                expect.fail("Expected an error to be thrown for empty exclusive services");
            } catch (err: unknown) {
                expect((err as Error).message).to.include('There are no services exclusive to the "shared-only" profile.');
                expect(context.errorHandling.suppressReportIssue).to.be.true;
            }
        });
    });
});
