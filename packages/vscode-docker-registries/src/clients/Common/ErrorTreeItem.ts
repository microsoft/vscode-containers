/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isUnauthorizedError } from '../../utils/errors';
import { CommonError, CommonRegistryItem } from './models';

export interface RegistryConnectError extends CommonError {
    readonly parent: CommonRegistryItem | undefined;
    readonly type: 'commonerror';
    readonly additionalContextValues: ['registryConnectError'];
}

export function getErrorTreeItem(error: unknown, parent: CommonRegistryItem | undefined): CommonError[] {
    // If the error is an Unauthorized error, return a special error type
    if (isUnauthorizedError(error)) {
        return [{
            parent,
            label: error.message,
            type: 'commonerror',
            additionalContextValues: ['registryConnectError'],
        } as RegistryConnectError];
    }

    // Otherwise, return a generic error
    return [{
        parent: parent,
        label: error instanceof Error ? error.message : vscode.l10n.t('Unknown error'),
        type: 'commonerror',
    }];
}
