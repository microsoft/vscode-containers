/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { legacyExtensionId, extensionId as newExtensionId } from '../../constants';

const languageIds = ['dockerfile', 'dockercompose'];
const settingIds = ['editor.defaultFormatter', 'editor.defaultFoldingRangeProvider'];

/**
 * Language-specific settings can specify an extension to do some particular job. We need to migrate
 * some of these settings from the old Docker extension to the new Container Tools extension.
 *
 * See also `migrateDockerToContainersSettingsIfNeeded` which is similar, but not really similar
 * enough to share code.
 */
export async function migrateLanguageSpecificSettingsIfNeeded(context: vscode.ExtensionContext): Promise<void> {
    await callWithTelemetryAndErrorHandling('vscode-containers.migrateLanguageSpecificSettings', async (actionContext: IActionContext) => {
        actionContext.telemetry.properties.isActivationEvent = 'true';
        actionContext.errorHandling.suppressDisplay = true;

        let numSettingsMigrated = 0;
        try {
            numSettingsMigrated += await migrateGlobalLanguageSettingsIfNeeded(context);
            numSettingsMigrated += await migrateWorkspaceLanguageSettingsIfNeeded(context);

            actionContext.telemetry.measurements.numSettingsMigrated = numSettingsMigrated;

            if (numSettingsMigrated > 0) {
                // Don't wait, just a toast
                void vscode.window.showInformationMessage(vscode.l10n.t('Some of your language-specific setting values have been changed automatically. Please commit those that are under source control.'));
            } else {
                // If no settings were migrated, don't bother with a telemetry event
                actionContext.telemetry.suppressIfSuccessful = true;
            }
        } finally {
            // Mark that we've migrated so we don't do it again
            await context.globalState.update('containers.languageSettings.migrated', true);
            await context.workspaceState.update('containers.languageSettings.migrated', true);
        }
    });
}

async function migrateGlobalLanguageSettingsIfNeeded(context: vscode.ExtensionContext): Promise<number> {
    // If migration has been performed globally, don't do it again globally
    const globalMigrated = context.globalState.get<boolean>('containers.languageSettings.migrated', false);
    if (globalMigrated) {
        return 0;
    }

    let numSettingsMigrated = 0;

    // For each and every language and setting, migrate it if it exists--global to global
    for (const languageId of languageIds) {
        for (const settingId of settingIds) {
            numSettingsMigrated += await migrateSingleLanguageSetting(languageId, settingId, vscode.ConfigurationTarget.Global);
        }
    }

    return numSettingsMigrated;
}

async function migrateWorkspaceLanguageSettingsIfNeeded(context: vscode.ExtensionContext): Promise<number> {
    // If migration has been performed for this workspace, don't do it again
    const workspaceMigrated = context.workspaceState.get<boolean>('containers.languageSettings.migrated', false);
    if (workspaceMigrated) {
        return 0;
    }

    let numSettingsMigrated = 0;

    // For each and every language and setting, migrate it if it exists--workspace to workspace, workspace folder to workspace folder, etc.
    for (const languageId of languageIds) {
        for (const settingId of settingIds) {
            numSettingsMigrated += await migrateSingleLanguageSetting(languageId, settingId, vscode.ConfigurationTarget.Workspace);
            numSettingsMigrated += await migrateSingleLanguageSetting(languageId, settingId, vscode.ConfigurationTarget.WorkspaceFolder);
        }
    }

    return numSettingsMigrated;
}

/**
 * The only settings we are migrating have string values that point to an extension ID.
 * If the setting exists and is `ms-azuretools.vscode-docker`, we will migrate it to point to the `ms-azuretools.vscode-containers` extension.
 */
async function migrateSingleLanguageSetting(languageId: string, settingId: string, target: vscode.ConfigurationTarget): Promise<number> {
    const configuration = vscode.workspace.getConfiguration(undefined, { languageId: languageId });

    let oldValue: string | undefined;
    const oldInspected = configuration.inspect<string>(settingId);

    switch (target) {
        case vscode.ConfigurationTarget.Global:
            oldValue = oldInspected.globalLanguageValue;
            break;
        case vscode.ConfigurationTarget.Workspace:
            oldValue = oldInspected.workspaceLanguageValue;
            break;
        case vscode.ConfigurationTarget.WorkspaceFolder:
            oldValue = oldInspected.workspaceFolderLanguageValue;
            break;
    }

    if (oldValue === legacyExtensionId) {
        await configuration.update(settingId, newExtensionId, target);
        return 1;
    }

    return 0;
}
