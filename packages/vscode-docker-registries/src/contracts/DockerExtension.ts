/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { RegistryDataProvider } from './RegistryDataProvider';
import { RegistryItem } from './RegistryItem';

export interface DockerExtensionApi {
    registerRegistryDataProvider<T extends RegistryItem>(id: string, registryDataProvider: RegistryDataProvider<T>): vscode.Disposable;
}
