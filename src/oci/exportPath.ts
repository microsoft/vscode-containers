/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';

const EXPORT_PATH_SETTING = 'oci.exportPath';

function getExportDir(): string {
    return vscode.workspace.getConfiguration(configPrefix).get<string>(EXPORT_PATH_SETTING, '');
}

async function promptForExportDir(): Promise<string | undefined> {
    const tempLabel = vscode.l10n.t('Use temporary folder');
    const chooseLabel = vscode.l10n.t('Choose folder…');

    const choice = await vscode.window.showQuickPick(
        [
            { label: tempLabel, description: os.tmpdir() },
            { label: chooseLabel },
        ],
        {
            placeHolder: vscode.l10n.t('Where should exported OCI layouts be saved?'),
            ignoreFocusOut: true,
        }
    );

    if (!choice) {
        return undefined;
    }

    let dir: string;

    if (choice.label === tempLabel) {
        dir = '';
    } else {
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: vscode.l10n.t('Select Export Folder'),
        });

        if (!selected || !selected[0]) {
            return undefined;
        }

        dir = selected[0].fsPath;
    }

    const dontSave = vscode.l10n.t("Don't save");
    const workspaceLabel = vscode.l10n.t('This workspace');
    const userLabel = vscode.l10n.t('All workspaces (user settings)');

    const saveChoice = await vscode.window.showQuickPick(
        [
            { label: dontSave, description: vscode.l10n.t('Ask again next time') },
            { label: workspaceLabel, description: vscode.l10n.t('Save in workspace settings') },
            { label: userLabel, description: vscode.l10n.t('Save in user settings') },
        ],
        {
            placeHolder: vscode.l10n.t('Remember this choice?'),
            ignoreFocusOut: true,
        }
    );

    if (!saveChoice) {
        return undefined;
    }

    if (saveChoice.label === workspaceLabel) {
        await vscode.workspace
            .getConfiguration(configPrefix)
            .update(EXPORT_PATH_SETTING, dir, vscode.ConfigurationTarget.Workspace);
    } else if (saveChoice.label === userLabel) {
        await vscode.workspace
            .getConfiguration(configPrefix)
            .update(EXPORT_PATH_SETTING, dir, vscode.ConfigurationTarget.Global);
    }

    if (dir) {
        await offerGitignore(dir);
    }

    return dir;
}

async function offerGitignore(exportDir: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        return;
    }

    for (const folder of workspaceFolders) {
        const rootPath = folder.uri.fsPath;
        const relativePath = path.relative(rootPath, exportDir);

        if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            continue;
        }

        const gitignorePath = path.join(rootPath, '.gitignore');

        if (!fs.existsSync(gitignorePath)) {
            continue;
        }

        const entry = `/${relativePath.replace(/\\/g, '/')}/`;
        const content = fs.readFileSync(gitignorePath, 'utf8');

        if (content.includes(entry) || content.includes(entry.slice(0, -1))) {
            return;
        }

        const yes = vscode.l10n.t('Yes');
        const answer = await vscode.window.showInformationMessage(
            vscode.l10n.t('Add {0} to .gitignore?', entry),
            yes,
            vscode.l10n.t('No')
        );

        if (answer === yes) {
            const newline = content.endsWith('\n') ? '' : '\n';
            fs.appendFileSync(gitignorePath, `${newline}${entry}\n`);
        }

        return;
    }
}

export async function resolveExportDir(): Promise<string> {
    let configuredDir = getExportDir();
    const config = vscode.workspace.getConfiguration(configPrefix);
    const inspect = config.inspect<string>(EXPORT_PATH_SETTING);

    const hasExplicitSetting = Boolean(
        inspect &&
            (inspect.workspaceValue !== undefined ||
                inspect.workspaceFolderValue !== undefined ||
                inspect.globalValue !== undefined)
    );

    if (!hasExplicitSetting) {
        const chosen = await promptForExportDir();

        if (chosen === undefined) {
            throw new vscode.CancellationError();
        }

        configuredDir = chosen;
    }

    return configuredDir;
}
