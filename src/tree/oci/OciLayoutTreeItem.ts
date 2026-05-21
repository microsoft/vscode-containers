/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, AzExtTreeItem, GenericTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from "vscode";
import { ext } from "../../extensionVariables";
import { OCI_ROOT_PATH_STATE_KEY } from "../../oci/constants";
import { parseLayout } from "../../oci/ociLayout";
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
        const rootPath = ext.context.workspaceState.get<string>(OCI_ROOT_PATH_STATE_KEY);

        if (!rootPath) {
            return [this.createInfoItem('empty', vscode.l10n.t('Use Explore Image to load an OCI layout'))];
        }

        try {
            const layout = parseLayout(rootPath);
            return layout.roots.map(
                (key, index) => new OciNodeTreeItem(this, layout.nodesByKey[key], layout.nodesByKey, index)
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return [this.createInfoItem('error', message)];
        }
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
}
