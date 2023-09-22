/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ContextValueRegistryItem, RegistryItem } from '../../contracts/RegistryItem';

export interface CommonRegistryItem extends RegistryItem, ContextValueRegistryItem {
    readonly parent: CommonRegistryItem | undefined;
    readonly label: string;
    readonly iconPath?: string | vscode.Uri | { light: string | vscode.Uri; dark: string | vscode.Uri } | vscode.ThemeIcon
    readonly description?: string;
    readonly baseUrl?: vscode.Uri;
}

export function isCommonRegistryItem(maybeCommonRegistryItem: unknown): maybeCommonRegistryItem is CommonRegistryItem {
    return !!maybeCommonRegistryItem && typeof maybeCommonRegistryItem === 'object' &&
        (maybeCommonRegistryItem as CommonRegistryItem).type !== undefined &&
        (maybeCommonRegistryItem as CommonRegistryItem).label !== undefined;
}

export interface CommonRegistryRoot extends CommonRegistryItem {
    readonly parent: undefined;
    readonly type: 'commonroot';
}

export function isRegistryRoot(maybeRegistryRoot: unknown): maybeRegistryRoot is CommonRegistryRoot {
    return !!maybeRegistryRoot && typeof maybeRegistryRoot === 'object' && (maybeRegistryRoot as CommonRegistryRoot).type === 'commonroot';
}

export interface CommonRegistry extends CommonRegistryItem {
    readonly parent: CommonRegistryItem;
    readonly type: 'commonregistry';
    readonly baseUrl: vscode.Uri;
}

export function isRegistry(maybeRegistry: unknown): maybeRegistry is CommonRegistry {
    return !!maybeRegistry && typeof maybeRegistry === 'object' && (maybeRegistry as CommonRegistry).type === 'commonregistry';
}

export interface CommonRepository extends CommonRegistryItem {
    readonly parent: CommonRegistry;
    readonly type: 'commonrepository';
    readonly baseUrl: vscode.Uri;
}

export function isRepository(maybeRepository: unknown): maybeRepository is CommonRepository {
    return !!maybeRepository && typeof maybeRepository === 'object' && (maybeRepository as CommonRepository).type === 'commonrepository';
}

export interface CommonTag extends CommonRegistryItem {
    readonly parent: CommonRepository;
    readonly type: 'commontag';
    createdAt?: Date;
    readonly baseUrl: vscode.Uri;
}

export function isTag(maybeTag: unknown): maybeTag is CommonTag {
    return !!maybeTag && typeof maybeTag === 'object' && (maybeTag as CommonTag).type === 'commontag';
}

export interface CommonError extends CommonRegistryItem {
    readonly parent: CommonRegistryItem | undefined;
    readonly type: 'commonerror';
}

export function isError(maybeError: unknown): maybeError is CommonError {
    return !!maybeError && typeof maybeError === 'object' && (maybeError as CommonError).type === 'commonerror';
}
