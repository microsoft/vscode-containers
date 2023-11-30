/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RegistryDataProvider } from '../../contracts/RegistryDataProvider';
import { CommonRegistry, CommonRegistryItem, CommonRegistryRoot, CommonRepository, CommonTag, isRegistry, isRegistryRoot, isRepository, isTag, isError } from './models';
import { getContextValue } from '../../utils/contextValues';
import { LoginInformation } from '../../contracts/BasicCredentials';
import * as dayjs from 'dayjs';
import * as relativeTime from 'dayjs/plugin/relativeTime';
import { getErrorTreeItem } from './ErrorTreeItem';

dayjs.extend(relativeTime);

export abstract class CommonRegistryDataProvider implements RegistryDataProvider<CommonRegistryItem>, vscode.Disposable {
    protected readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<CommonRegistryItem | undefined>();
    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    public dispose(): void {
        this.onDidChangeTreeDataEmitter.dispose();
    }

    public async getChildren(element?: CommonRegistryItem | undefined): Promise<CommonRegistryItem[]> {
        try {
            if (!element) {
                return [await this.getRoot()];
            } else if (isRegistryRoot(element)) {
                return await this.getRegistries(element);
            } else if (isRegistry(element)) {
                return await this.getRepositories(element);
            } else if (isRepository(element)) {
                return await this.getTags(element);
            } else {
                throw new Error(`Unexpected element: ${JSON.stringify(element)}`);
            }
        } catch (error: unknown) {
            return getErrorTreeItem(error, element);
        }
    }

    public getTreeItem(element: CommonRegistryItem): Promise<vscode.TreeItem> {
        if (isRegistryRoot(element)) {
            return Promise.resolve({
                ...element,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                contextValue: getContextValue(element, 'commonregistryroot'),
                iconPath: element.iconPath,
            });
        } else if (isRegistry(element)) {
            return Promise.resolve({
                ...element,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                contextValue: getContextValue(element, 'commonregistry'),
                iconPath: element.iconPath || new vscode.ThemeIcon('briefcase'),
            });
        } else if (isRepository(element)) {
            return Promise.resolve({
                ...element,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                contextValue: getContextValue(element, 'commonrepository'),
                iconPath: new vscode.ThemeIcon('repo'),
            });
        } else if (isTag(element)) {
            return Promise.resolve({
                ...element,
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                contextValue: getContextValue(element, 'commontag'),
                iconPath: new vscode.ThemeIcon('bookmark'),
                description: element.createdAt ? dayjs(element.createdAt).fromNow() : undefined,
            });
        } else if (isError(element)) {
            return Promise.resolve({
                ...element,
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                contextValue: getContextValue(element, 'commonerror'),
                iconPath: new vscode.ThemeIcon('error', new vscode.ThemeColor('problemsErrorIcon.foreground')),
            });
        } else {
            throw new Error(`Unexpected element: ${JSON.stringify(element)}`);
        }
    }

    public abstract readonly id: string;
    public abstract readonly label: string;
    public abstract readonly description?: string;
    public abstract readonly iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon;

    public abstract getRoot(): Promise<CommonRegistryRoot> | CommonRegistryRoot;
    public abstract getRegistries(root: CommonRegistryRoot | CommonRegistryItem): Promise<CommonRegistry[]> | CommonRegistry[];
    public abstract getRepositories(registry: CommonRegistry): Promise<CommonRepository[]> | CommonRepository[];
    public abstract getTags(repository: CommonRepository): Promise<CommonTag[]> | CommonTag[];

    public getLoginInformation?(item: CommonRegistryItem): Promise<LoginInformation> | LoginInformation;

    public deleteRegistry?(item: CommonRegistry): Promise<void>;
    public deleteRepository?(item: CommonRepository): Promise<void>;
    public deleteTag?(item: CommonTag): Promise<void>;
}
