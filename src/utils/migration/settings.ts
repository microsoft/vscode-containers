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

            if (numSettingsMigrated > 0) {
                // Don't wait, just a toast
                void vscode.window.showInformationMessage('Some of your setting IDs have been changed automatically. Please commit those that are under source control.');
            }
        } finally {
            // Mark that we've migrated (or consent was not given) so we don't do it again
            await context.globalState.update('containers.settings.migrated', true);
            await context.workspaceState.update('containers.settings.migrated', true);

            actionContext.telemetry.measurements.numSettingsMigrated = numSettingsMigrated;
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

    const oldConfig = vscode.workspace.getConfiguration('docker');
    const newConfig = vscode.workspace.getConfiguration('containers');

    // For each and every setting, migrate it if it exists--global to global
    for (const oldSetting of Object.keys(settingsMap)) {
        const newSetting = settingsMap[oldSetting];
        numSettingsMigrated += await migrateSingleSetting(oldConfig, oldSetting, newConfig, newSetting, vscode.ConfigurationTarget.Global);
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

    const oldConfig = vscode.workspace.getConfiguration('docker');
    const newConfig = vscode.workspace.getConfiguration('containers');

    // For each and every setting, migrate it if it exists--workspace to workspace, workspace folder to workspace folder, etc.
    for (const oldSetting of Object.keys(settingsMap)) {
        const newSetting = settingsMap[oldSetting];
        numSettingsMigrated += await migrateSingleSetting(oldConfig, oldSetting, newConfig, newSetting, vscode.ConfigurationTarget.Workspace);
        numSettingsMigrated += await migrateSingleSetting(oldConfig, oldSetting, newConfig, newSetting, vscode.ConfigurationTarget.WorkspaceFolder);
    }

    return numSettingsMigrated;
}

async function migrateSingleSetting(oldConfig: vscode.WorkspaceConfiguration, oldSetting: string, newConfig: vscode.WorkspaceConfiguration, newSetting: string, target: vscode.ConfigurationTarget): Promise<number> {
    let oldValue: unknown;

    const inspected = oldConfig.inspect(oldSetting);
    switch (target) {
        case vscode.ConfigurationTarget.Global:
            oldValue = inspected?.globalValue;
            break;
        case vscode.ConfigurationTarget.Workspace:
            oldValue = inspected?.workspaceValue;
            break;
        case vscode.ConfigurationTarget.WorkspaceFolder:
            oldValue = inspected?.workspaceFolderValue;
            break;
    }

    if (oldValue !== undefined) {
        await newConfig.update(newSetting, oldValue, target);
        return 1;
    }

    return 0;
}
