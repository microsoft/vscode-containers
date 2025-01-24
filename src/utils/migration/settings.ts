/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, IActionContext } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { settingsMap } from './settingsMap';

export async function migrateDockerToContainersSettingsIfNeeded(context: vscode.ExtensionContext): Promise<void> {
    await callWithTelemetryAndErrorHandling('vscode-containers.migrateSettings', async (actionContext: IActionContext) => {
        actionContext.telemetry.properties.isActivationEvent = 'true';
        actionContext.errorHandling.suppressDisplay = true;

        let numSettingsMigrated = 0;
        try {
            numSettingsMigrated += await migrateGlobalDockerToContainersSettingsIfNeeded(context);
            numSettingsMigrated += await migrateWorkspaceDockerToContainersSettingsIfNeeded(context);

            actionContext.telemetry.measurements.numSettingsMigrated = numSettingsMigrated;

            if (numSettingsMigrated > 0) {
                // Don't wait, just a toast
                void vscode.window.showInformationMessage('Some of your setting IDs have been changed automatically. Please commit those that are under source control.');
            } else {
                // If no settings were migrated, don't bother with a telemetry event
                actionContext.telemetry.suppressIfSuccessful = true;
            }
        } finally {
            // Mark that we've migrated so we don't do it again
            await context.globalState.update('containers.settings.migrated', true);
            await context.workspaceState.update('containers.settings.migrated', true);
        }
    });
}

async function migrateGlobalDockerToContainersSettingsIfNeeded(context: vscode.ExtensionContext): Promise<number> {
    // If migration has been performed globally, don't do it again globally
    const globalMigrated = context.globalState.get<boolean>('containers.settings.migrated', false);
    if (globalMigrated) {
        return 0;
    }

    let numSettingsMigrated = 0;

    // For each and every setting, migrate it if it exists--global to global
    for (const oldSetting of Object.keys(settingsMap)) {
        const newSetting = settingsMap[oldSetting];
        numSettingsMigrated += await migrateSingleSetting(oldSetting, newSetting, vscode.ConfigurationTarget.Global);
    }

    return numSettingsMigrated;
}

async function migrateWorkspaceDockerToContainersSettingsIfNeeded(context: vscode.ExtensionContext): Promise<number> {
    // If migration has been performed for this workspace, don't do it again
    const workspaceMigrated = context.workspaceState.get<boolean>('containers.settings.migrated', false);
    if (workspaceMigrated) {
        return 0;
    }

    let numSettingsMigrated = 0;

    // For each and every setting, migrate it if it exists--workspace to workspace, workspace folder to workspace folder, etc.
    for (const oldSetting of Object.keys(settingsMap)) {
        const newSetting = settingsMap[oldSetting];
        numSettingsMigrated += await migrateSingleSetting(oldSetting, newSetting, vscode.ConfigurationTarget.Workspace);
        numSettingsMigrated += await migrateSingleSetting(oldSetting, newSetting, vscode.ConfigurationTarget.WorkspaceFolder);
    }

    return numSettingsMigrated;
}

async function migrateSingleSetting(oldSetting: string, newSetting: string, target: vscode.ConfigurationTarget): Promise<number> {
    const config = vscode.workspace.getConfiguration();

    let oldValue: unknown;
    let newValue: unknown;

    const oldInspected = config.inspect(oldSetting);
    const newInspected = config.inspect(newSetting);
    switch (target) {
        case vscode.ConfigurationTarget.Global:
            oldValue = oldInspected?.globalValue;
            newValue = newInspected?.globalValue;
            break;
        case vscode.ConfigurationTarget.Workspace:
            oldValue = oldInspected?.workspaceValue;
            newValue = newInspected?.workspaceValue;
            break;
        case vscode.ConfigurationTarget.WorkspaceFolder:
            oldValue = oldInspected?.workspaceFolderValue;
            newValue = newInspected?.workspaceFolderValue;
            break;
    }

    // If there is an old value, but *not* a new value, we'll migrate the setting
    if (oldValue !== undefined && newValue === undefined) {
        await config.update(newSetting, oldValue, target);
        return 1;
    }

    return 0;
}
