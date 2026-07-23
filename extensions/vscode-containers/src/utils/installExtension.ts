/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, IActionContext, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as semver from 'semver';
import * as vscode from 'vscode';

export function isExtensionInstalledAndVersionCompatible(extensionId: string, minimumVersion: string): boolean {
    const extension = vscode.extensions.getExtension(extensionId);

    if (!extension?.packageJSON?.version) {
        return false;
    }

    const extensionVersion = semver.parse(extension.packageJSON.version) ?? semver.coerce(extension.packageJSON.version);
    const minVersion = semver.parse(minimumVersion) ?? semver.coerce(minimumVersion);

    if (!extensionVersion || !minVersion) {
        return false;
    }

    return semver.gte(extensionVersion, minVersion);
}

export async function openExtensionInstallPage(
    context: IActionContext,
    extensionId: string,
    minimumVersion: string,
    extensionDisplayName: string,
    cancelledErrorBase: string,
): Promise<void> {
    const existingExtension = vscode.extensions.getExtension(extensionId);
    const isUpdate = !!existingExtension;

    const message = isUpdate
        ? vscode.l10n.t(
            'The {0} extension must be updated to version {1} or higher to deploy to {0}. Would you like to update it now?',
            extensionDisplayName,
            minimumVersion
        )
        : vscode.l10n.t(
            'Version {0} or higher of the {1} extension is required to deploy to {1}. Would you like to install it now?',
            minimumVersion,
            extensionDisplayName
        );

    const action: vscode.MessageItem = {
        title: isUpdate ? vscode.l10n.t('Update') : vscode.l10n.t('Install'),
    };

    const result = await context.ui.showWarningMessage(message, { modal: true }, action, DialogResponses.cancel);

    if (result === action) {
        await vscode.commands.executeCommand('extension.open', extensionId);
        await vscode.commands.executeCommand('workbench.extensions.installExtension', extensionId);
    } else {
        throw new UserCancelledError(`${cancelledErrorBase}Declined`);
    }

    throw new UserCancelledError(`${cancelledErrorBase}Accepted`);
}
