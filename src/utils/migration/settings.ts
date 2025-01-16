/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { settingsMap } from './settingsMap';

export async function migrateDockerToContainersSettingsIfNeeded(context: vscode.ExtensionContext): Promise<void> {
    try {
        const promptResult = await migrateGlobalDockerToContainersSettingsIfNeeded(context);
        await migrateWorkspaceDockerToContainersSettingsIfNeeded(context, promptResult);
    } finally {
        // Mark that we've migrated (or consent was not given) so we don't do it again
        await context.globalState.update('containers.settings.migrated', true);
        await context.workspaceState.update('containers.settings.migrated', true);
    }
}

async function migrateGlobalDockerToContainersSettingsIfNeeded(context: vscode.ExtensionContext): Promise<boolean | undefined> {
    // If migration has been performed globally, don't do it again globally
    const globalMigrated = context.globalState.get<boolean>('containers.settings.migrated', false);
    if (globalMigrated) {
        return undefined;
    }

    // Prompt the user to ensure it's OK to migrate settings
    const promptResult = await vscode.window.showInformationMessage(vscode.l10n.t('The "Docker" extension has been renamed to "Container Tools". Would you like to migrate your user and workspace settings?'), DialogResponses.yes, DialogResponses.no);
    if (promptResult === DialogResponses.no) {
        return false;
    } else if (promptResult !== DialogResponses.yes) {
        return undefined;
    }

    const oldConfig = vscode.workspace.getConfiguration('docker');
    const newConfig = vscode.workspace.getConfiguration('containers');

    // For each and every setting, migrate it if it exists--global to global
    for (const oldSetting of Object.keys(settingsMap)) {
        const newSetting = settingsMap[oldSetting];
        await migrateSetting(oldConfig, oldSetting, newConfig, newSetting, vscode.ConfigurationTarget.Global);
    }

    return true;
}

async function migrateWorkspaceDockerToContainersSettingsIfNeeded(context: vscode.ExtensionContext, previouslyPromptedResult: boolean | undefined): Promise<void> {
    // If migration has been performed for this workspace, don't do it again
    const workspaceMigrated = context.workspaceState.get<boolean>('containers.settings.migrated', false);
    if (workspaceMigrated) {
        return;
    }

    if (previouslyPromptedResult === false) {
        return;
    }

    const oldConfig = vscode.workspace.getConfiguration('docker');
    const newConfig = vscode.workspace.getConfiguration('containers');

    // For each and every setting, migrate it if it exists--workspace to workspace, workspace folder to workspace folder, etc.
    for (const oldSetting of Object.keys(settingsMap)) {
        const newSetting = settingsMap[oldSetting];
        await migrateSetting(oldConfig, oldSetting, newConfig, newSetting, vscode.ConfigurationTarget.Workspace);
        await migrateSetting(oldConfig, oldSetting, newConfig, newSetting, vscode.ConfigurationTarget.WorkspaceFolder);
    }
}

async function migrateSetting(oldConfig: vscode.WorkspaceConfiguration, oldSetting: string, newConfig: vscode.WorkspaceConfiguration, newSetting: string, target: vscode.ConfigurationTarget): Promise<void> {
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
    }
}
