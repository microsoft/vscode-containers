/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerLMTool } from '@microsoft/vscode-azext-utils';
import { ContainersConfigTool } from './containersConfigTool';

export function registerContainersLMTools(): void {
    registerLMTool('container-tools_get-config', new ContainersConfigTool());
}
