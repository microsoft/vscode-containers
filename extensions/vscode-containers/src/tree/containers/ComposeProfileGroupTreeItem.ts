/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, AzExtTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { ThemeIcon, TreeItemCollapsibleState, l10n } from "vscode";
import type { ContainerGroupTreeItem } from "./ContainerGroupTreeItem";
import { ContainerTreeItem } from "./ContainerTreeItem";
import { DockerContainerInfo } from "./ContainersTreeItem";
import { getComposeProfilesForContainer } from "./composeProfiles";
import { getComposeServiceName } from "../../utils/composeLabels";

/**
 * A tree item that represents a Docker Compose profile group (or the "Default" group
 * for services with no profile assignment) nested under a {@link ContainerGroupTreeItem}.
 *
 * Children are {@link ContainerTreeItem} instances for each container whose service
 * belongs to this profile.
 */
export class ComposeProfileGroupTreeItem extends AzExtParentTreeItem {
    public static readonly contextValue: string = 'composeProfileGroup';
    public readonly contextValue: string = ComposeProfileGroupTreeItem.contextValue;
    public readonly canMultiSelect: boolean = true;
    public childTypeLabel: string = 'container';
    public declare readonly initialCollapsibleState: TreeItemCollapsibleState | undefined;

    /** The profile name, or undefined if this is the "Default" group. */
    public readonly profileName: string | undefined;

    /** The container info items that belong to this group. */
    private readonly _items: DockerContainerInfo[];

    /** Lazily-built container tree items. */
    private _childTreeItems: ContainerTreeItem[] | undefined;

    private readonly _serviceProfiles?: Map<string, string[]>;

    public constructor(
        parent: ContainerGroupTreeItem,
        group: string,
        items: DockerContainerInfo[],
        profileName?: string,
        serviceProfiles?: Map<string, string[]>,
    ) {
        super(parent);
        // Use a stable ID so the tree can diff updates correctly
        this.id = `${parent.id}|profile:${group}`;
        this._items = items;
        this.profileName = profileName;
        this._serviceProfiles = serviceProfiles;
        this.initialCollapsibleState = TreeItemCollapsibleState.Expanded;
    }

    public getExclusiveServiceNames(): string[] {
        const names = this.getServiceNames();
        if (!this._serviceProfiles || !this.profileName) {
            return names; // Default fallback
        }
        return names.filter(name => {
            const profiles = this._serviceProfiles?.get(name);
            return profiles && profiles.length === 1 && profiles[0] === this.profileName;
        });
    }

    public get label(): string {
        return this.profileName ?? l10n.t('Default');
    }

    public get iconPath(): ThemeIcon {
        return new ThemeIcon('multiple-windows');
    }

    public get description(): string | undefined {
        return this.profileName ? l10n.t('Profile') : l10n.t('Default services');
    }

    // -------------------------------------------------------------------------
    // Children

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean): Promise<AzExtTreeItem[]> {
        this._childTreeItems = this._items.map(item => new ContainerTreeItem(this, item));
        return this._childTreeItems;
    }

    /** Returns the already-built child items without triggering an async load. */
    public get ChildTreeItems(): AzExtTreeItem[] {
        if (!this._childTreeItems) {
            this._childTreeItems = this._items.map(item => new ContainerTreeItem(this, item));
        }
        return this._childTreeItems;
    }

    // -------------------------------------------------------------------------
    // Helpers used by commands

    /**
     * Returns the sorted list of unique Docker Compose service names for the containers
     * in this profile group, for use with `docker compose <command> <service...>`.
     */
    public getServiceNames(): string[] {
        const serviceNames = new Set<string>();

        for (const item of this._items) {
            const serviceName = getComposeServiceName(item.labels);
            if (serviceName) {
                serviceNames.add(serviceName);
            }
        }

        return [...serviceNames].sort((a, b) => a.localeCompare(b));
    }

    public getProfilesForContainer(container: ContainerTreeItem): string[] {
        if (!this._serviceProfiles) {
            return [];
        }
        return getComposeProfilesForContainer(container, this._serviceProfiles) || [];
    }

    // -------------------------------------------------------------------------
    // Tree item protocol

    public compareChildrenImpl(ti1: AzExtTreeItem, ti2: AzExtTreeItem): number {
        return (this.parent as ContainerGroupTreeItem).compareChildrenImpl(ti1, ti2);
    }

    public isAncestorOfImpl(expectedContextValue: string | RegExp): boolean {
        // Containers are the only direct children; don't claim ancestry for things deeper than that
        return this.ChildTreeItems.some(c => {
            if (typeof expectedContextValue === 'string') {
                return c.contextValue === expectedContextValue;
            }
            return expectedContextValue.test(c.contextValue);
        });
    }

    public async deleteTreeItemImpl(context: IActionContext): Promise<void> {
        const errors: unknown[] = [];

        for (const container of this.ChildTreeItems) {
            try {
                await container.deleteTreeItem(context);
            } catch (error) {
                errors.push(error);
            }
        }

        if (errors.length > 0) {
            throw new Error(errors.map(String).join('\n'));
        }
    }
}