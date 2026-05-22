/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, AzExtTreeItem, GenericTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import { PodmanClient } from "@microsoft/vscode-container-client";
import * as vscode from "vscode";
import { ext } from "../../extensionVariables";
import { OCI_ROOT_PATH_STATE_KEY, ORAS_COMMAND } from "../../oci/constants";
import { parseLayout } from "../../oci/ociLayout";
import { findOnPath } from "../../utils/findOnPath";
import { OciNodeTreeItem } from "./OciNodeTreeItem";

export class OciLayoutTreeItem extends AzExtParentTreeItem {
    public static readonly contextValue: string = 'ociRoot';
    public label: string = vscode.l10n.t('OCI Layout');
    public contextValue: string = OciLayoutTreeItem.contextValue;

    public async setRootPath(rootPath: string | undefined, context: IActionContext): Promise<void> {
        await ext.context.workspaceState.update(OCI_ROOT_PATH_STATE_KEY, rootPath);
        await this.refresh(context);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public async loadMoreChildrenImpl(_clearCache: boolean, _context: IActionContext): Promise<AzExtTreeItem[]> {
        const children: AzExtTreeItem[] = [];

        const prerequisiteWarning = await this.tryCreatePrerequisiteWarning();
        if (prerequisiteWarning) {
            children.push(prerequisiteWarning);
        }

        const rootPath = ext.context.workspaceState.get<string>(OCI_ROOT_PATH_STATE_KEY);

        if (!rootPath) {
            children.push(this.createInfoItem('empty', vscode.l10n.t('Use Explore Image to load an OCI layout')));
            return children;
        }

        try {
            const layout = parseLayout(rootPath);
            children.push(
                ...layout.roots.map(
                    (key, index) => new OciNodeTreeItem(this, layout.nodesByKey[key], layout.nodesByKey, index)
                )
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            children.push(this.createInfoItem('error', message));
        }

        return children;
    }

    public compareChildrenImpl(item1: AzExtTreeItem, item2: AzExtTreeItem): number {
        return item1.id.localeCompare(item2.id);
    }

    private createInfoItem(id: string, label: string): GenericTreeItem {
        const item = new GenericTreeItem(this, {
            label,
            contextValue: 'ociInfo',
            iconPath: new vscode.ThemeIcon('info'),
        });
        item.id = id;
        return item;
    }

    private async tryCreatePrerequisiteWarning(): Promise<GenericTreeItem | undefined> {
        let runtimeIsPodman: boolean;
        try {
            const client = await ext.runtimeManager.getClient();
            runtimeIsPodman = client.id === PodmanClient.ClientId;
        } catch {
            // If we can't determine the runtime, assume Docker so we still surface
            // the warning when ORAS is missing.
            runtimeIsPodman = false;
        }

        if (runtimeIsPodman) {
            return undefined;
        }

        if (findOnPath(ORAS_COMMAND)) {
            return undefined;
        }

        const item = new GenericTreeItem(this, {
            label: vscode.l10n.t('Podman or ORAS is required to export images to an OCI layout. Click to learn more.'),
            contextValue: 'ociPrerequisiteMissing',
            iconPath: new vscode.ThemeIcon('warning', new vscode.ThemeColor('problemsWarningIcon.foreground')),
            commandId: 'vscode-containers.oci.showPrerequisitesHelp',
            includeInTreeItemPicker: true,
        });
        item.id = 'prerequisite';
        return item;
    }
}
