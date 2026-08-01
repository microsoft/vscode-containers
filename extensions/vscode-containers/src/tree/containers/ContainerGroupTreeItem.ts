/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { ThemeIcon, TreeItemCollapsibleState } from "vscode";
import { ext } from '../../extensionVariables';
import { LocalGroupTreeItemBase } from "../LocalGroupTreeItemBase";
import { LocalRootTreeItemBase } from "../LocalRootTreeItemBase";
import { getCommonGroupIcon } from "../settings/CommonProperties";
import { ComposeProfileGroupTreeItem } from './ComposeProfileGroupTreeItem';
import { getComposeProfilesForContainer, getComposeServiceProfiles, getComposeSourceFiles } from './composeProfiles';
import { ContainerProperty, getContainerStateIcon, NonComposeGroupName } from "./ContainerProperties";
import { DockerContainerInfo } from "./ContainersTreeItem";
import { ContainerTreeItem } from './ContainerTreeItem';

export class ContainerGroupTreeItem extends LocalGroupTreeItemBase<DockerContainerInfo, ContainerProperty> {
    public childTypeLabel: string = 'container';
    public declare readonly initialCollapsibleState: TreeItemCollapsibleState | undefined; // TypeScript gets mad if we don't re-declare this here
    public readonly canMultiSelect: boolean = true;
    private _profileChildren: AzExtTreeItem[] | undefined;

    public constructor(parent: LocalRootTreeItemBase<DockerContainerInfo, ContainerProperty>, group: string, items: DockerContainerInfo[]) {
        super(parent, group, items);

        if (this.parent.groupBySetting === 'Compose Project Name') {
            // Expand compose group nodes by default
            this.initialCollapsibleState = TreeItemCollapsibleState.Expanded;
        }
    }

    public get contextValue(): string {
        if (this.parent.groupBySetting === 'Compose Project Name' && this.group !== NonComposeGroupName) {
            return 'containerGroup;composeGroup';
        }

        return 'containerGroup';
    }

    public get ChildTreeItems(): AzExtTreeItem[] {
        return this._profileChildren ?? super.ChildTreeItems;
    }

    public get iconPath(): ThemeIcon {
        switch (this.parent.groupBySetting) {
            case 'ContainerId':
            case 'ContainerName':
            case 'Networks':
                return new ThemeIcon('repo-forked');
            case 'Ports':
            case 'Status':
            case 'Compose Project Name':
                return new ThemeIcon('multiple-windows');
            case 'State':
                return getContainerStateIcon(this.group);
            case 'Image':
            case 'Label':
                return new ThemeIcon('multiple-windows');
            default:
                return getCommonGroupIcon(this.parent.groupBySetting);
        }
    }

    public async loadMoreChildrenImpl(clearCache: boolean): Promise<AzExtTreeItem[]> {
        if (clearCache) {
            this._profileChildren = undefined;
        }

        if (this.parent.groupBySetting !== 'Compose Project Name' || this.group === NonComposeGroupName) {
            return super.loadMoreChildrenImpl(clearCache);
        }

        const containers = super.ChildTreeItems as ContainerTreeItem[];
        const labels = await this.getComposeGroupLabels(containers);
        const workingDirectory = labels && labels['com.docker.compose.project.working_dir'];
        const composeFiles = labels ? getComposeSourceFiles(labels) : undefined;
        const projectName = labels?.['com.docker.compose.project'];

        ext.outputChannel.appendLine(`[DEBUG] ContainerGroupTreeItem: workingDirectory=${workingDirectory}, composeFiles=${JSON.stringify(composeFiles)}`);

        if (!workingDirectory || !composeFiles?.length) {
            return super.loadMoreChildrenImpl(clearCache);
        }

        const serviceProfiles = await getComposeServiceProfiles(workingDirectory, composeFiles, projectName);
        if (!serviceProfiles) {
            return super.loadMoreChildrenImpl(clearCache);
        }

        const defaultContainers: ContainerTreeItem[] = [];
        const profileContainers = new Map<string, DockerContainerInfo[]>();

        for (const container of containers) {
            const profiles = getComposeProfilesForContainer(container, serviceProfiles);
            if (!profiles.length) {
                defaultContainers.push(container);
                continue;
            }

            for (const profile of profiles) {
                if (!profileContainers.has(profile)) {
                    profileContainers.set(profile, [container.containerItem as DockerContainerInfo]);
                } else {
                    profileContainers.set(profile, [...profileContainers.get(profile)!, container.containerItem as DockerContainerInfo]);
                }
            }
        }

        if (profileContainers.size === 0) {
            return containers;
        }

        const children: AzExtTreeItem[] = [];

        children.push(...defaultContainers);

        for (const profile of [...profileContainers.keys()].sort((a, b) => a.localeCompare(b))) {
            children.push(new ComposeProfileGroupTreeItem(this, profile, profileContainers.get(profile) ?? [], profile, serviceProfiles));
        }


        if (children.length > 0) {
            this._profileChildren = children;
            return children;
        }

        return containers;
    }

    public isAncestorOfImpl(expectedContextValue: string | RegExp): boolean {
        return this.ChildTreeItems.some((container: AzExtTreeItem) => this.matchesValueRecursive(container, expectedContextValue));
    }

    private matchesValue(container: AzExtTreeItem, expectedContextValue: (string | RegExp)): boolean {
        return container.contextValue === expectedContextValue
            || (expectedContextValue instanceof RegExp && expectedContextValue.test(container.contextValue));
    }

    public compareChildrenImpl(item1: AzExtTreeItem, item2: AzExtTreeItem): number {
        // If we're mixing loose default containers and profile folders, force loose containers to the top
        if (item1 instanceof ContainerTreeItem && item2 instanceof ComposeProfileGroupTreeItem) {
            return -1;
        }
        if (item1 instanceof ComposeProfileGroupTreeItem && item2 instanceof ContainerTreeItem) {
            return 1;
        }

        // Maintain old logic just in case we ever mix undefined profile groups
        if (item1 instanceof ComposeProfileGroupTreeItem && item2 instanceof ComposeProfileGroupTreeItem) {
            if (item1.profileName === undefined) {
                return -1;
            }
            if (item2.profileName === undefined) {
                return 1;
            }
        }
        
        return super.compareChildrenImpl(item1, item2);
    }

    private matchesValueRecursive(container: AzExtTreeItem, expectedContextValue: string | RegExp): boolean {
        if (this.matchesValue(container, expectedContextValue)) {
            return true;
        }

        if (container instanceof ComposeProfileGroupTreeItem) {
            return container.ChildTreeItems.some(child => this.matchesValueRecursive(child, expectedContextValue));
        }

        return false;
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        const containers = this.ChildTreeItems;
        const errors = [];

        for (const container of containers) {
            try {
                await container.deleteTreeItem(context);
            } catch (error) {
                errors.push(error);
            }
        }

        if (errors.length > 0) {
            throw new Error(errors.join());
        }
    }

    private async getComposeGroupLabels(containers: ContainerTreeItem[]): Promise<{ [key: string]: string } | undefined> {
        const container = containers.find(c => c.labels?.['com.docker.compose.project.config_files']);
        if (!container) {
            return undefined;
        }

        const inspectResult = await ext.runWithDefaults(client =>
            client.inspectContainers({ containers: [container.containerId] })
        );

        return inspectResult?.[0]?.labels;
    }
}
