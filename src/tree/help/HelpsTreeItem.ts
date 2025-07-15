/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtParentTreeItem, AzExtTreeItem, GenericTreeItem, IActionContext } from "@microsoft/vscode-azext-utils";
import * as vscode from "vscode";
import { ext } from "../../extensionVariables";
import { OpenUrlTreeItem } from "../OpenUrlTreeItem";

export class HelpsTreeItem extends AzExtParentTreeItem {
    public label: string = 'help';
    public contextValue: string = 'help';

    private values: GenericTreeItem[];
    public async loadMoreChildrenImpl(clearCache: boolean, context: IActionContext): Promise<AzExtTreeItem[]> {
        return this.values ?? (this.values = [
            this.readDocumentationTreeItem,
            this.watchVideosTreeItem,
            this.getStartedTreeItem,
            this.openWalkthroughTreeItem,
            this.openDockerDxTreeItem,
            this.reviewIssuesTreeItem,
            this.reportIssuesTreeItem,
            this.learnMoreDownloadDockerTreeItem,
        ]);
    }

    public hasMoreChildrenImpl(): boolean {
        return false;
    }

    public compareChildrenImpl(item1: AzExtTreeItem, item2: AzExtTreeItem): number {
        // default sorting is based on the label which is being displayed to user.
        // use id to control the order being dispalyed
        return item1.id.localeCompare(item2.id);
    }

    private get readDocumentationTreeItem(): AzExtTreeItem {
        const node = new OpenUrlTreeItem(
            this,
            vscode.l10n.t('Read Extension Documentation'),
            'https://aka.ms/helppanel_docs',
            new vscode.ThemeIcon('book')
        );
        node.id = '0';

        return node;
    }

    private get watchVideosTreeItem(): AzExtTreeItem {
        const node = new OpenUrlTreeItem(
            this,
            vscode.l10n.t('Watch Extension Tutorial Videos'),
            'https://aka.ms/helppanel_videos',
            new vscode.ThemeIcon('play-circle')
        );
        node.id = '10';

        return node;
    }

    private get getStartedTreeItem(): AzExtTreeItem {
        const node = new OpenUrlTreeItem(
            this,
            vscode.l10n.t('Get Started with Docker Tutorial'),
            'https://aka.ms/helppanel_getstarted',
            new vscode.ThemeIcon('star-empty')
        );
        node.id = '20';

        return node;
    }

    private get openWalkthroughTreeItem(): AzExtTreeItem {
        const node = new GenericTreeItem(
            this,
            {
                label: vscode.l10n.t('Open Container Tools Extension Walkthrough'),
                contextValue: 'OpenWalkthrough',
                commandId: 'vscode-containers.help.openWalkthrough',
                iconPath: new vscode.ThemeIcon('extensions'),
                includeInTreeItemPicker: true,
            }
        );
        node.id = '30';

        return node;
    }

    private get openDockerDxTreeItem(): AzExtTreeItem {
        const node = new GenericTreeItem(
            this,
            {
                label: vscode.l10n.t('Install Docker DX for Improved Editing'),
                contextValue: 'OpenDockerDx',
                commandId: 'extension.open',
                iconPath: {
                    light: vscode.Uri.joinPath(ext.context.extensionUri, 'resources', 'light', 'docker.svg'),
                    dark: vscode.Uri.joinPath(ext.context.extensionUri, 'resources', 'dark', 'docker.svg'),
                },
                includeInTreeItemPicker: true,
            }
        );
        node.id = '35';
        node.commandArgs = ['docker.docker'];

        return node;
    }

    private get reviewIssuesTreeItem(): AzExtTreeItem {
        const node = new OpenUrlTreeItem(
            this,
            vscode.l10n.t('Review Issues'),
            'https://aka.ms/helppanel_reviewissues',
            new vscode.ThemeIcon('issues')
        );
        node.id = '40';

        return node;
    }

    private get reportIssuesTreeItem(): AzExtTreeItem {
        const node = new GenericTreeItem(
            this,
            {
                label: vscode.l10n.t('Report Issue'),
                contextValue: 'Report Issue',
                commandId: 'vscode-containers.help.reportIssue',
                iconPath: new vscode.ThemeIcon('comment'),
                includeInTreeItemPicker: true,
            }
        );
        node.id = '50';

        return node;
    }

    private get learnMoreDownloadDockerTreeItem(): AzExtTreeItem {
        const node = new GenericTreeItem(
            this,
            {
                label: vscode.l10n.t('Docker Installation'),
                contextValue: 'Docker Installation',
                commandId: 'vscode-containers.openDockerDownloadPage',
                iconPath: new vscode.ThemeIcon('link-external'),
                includeInTreeItemPicker: true,
            }
        );
        node.id = '60';

        return node;
    }
}
