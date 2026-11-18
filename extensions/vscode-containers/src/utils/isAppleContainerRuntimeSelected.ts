/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AppleContainerClient } from '@microsoft/vscode-container-client';
import { ext } from '../extensionVariables';

/**
 * Whether the Apple `container` runtime is the selected container client. It has no publish-all
 * ports and no Docker-style network drivers, so callers use this to avoid sending those defaults.
 */
export function isAppleContainerRuntimeSelected(): boolean {
    return ext.runtimeManager.getSelectedClientId() === AppleContainerClient.ClientId;
}
