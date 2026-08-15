/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DialogResponses, IActionContext } from '@microsoft/vscode-azext-utils';
import * as path from "path";
import * as vscode from 'vscode';
import { COMPOSE_FILE_GLOB_PATTERN, CS_GLOB_PATTERN, CSPROJ_GLOB_PATTERN, DOCKERFILE_GLOB_PATTERN, FILE_SEARCH_MAX_RESULT, FSPROJ_GLOB_PATTERN, NET_BUILD_OUTPUT_EXCLUDE_PATTERN, YAML_GLOB_PATTERN } from "../constants";
import { suppressOuterLoadingPrompt } from './nestedPromptUtils';

export interface Item extends vscode.QuickPickItem {
    relativeFilePath: string;
    relativeFolderPath: string;
    absoluteFilePath: string;
    absoluteFolderPath: string;
}

async function getFileUris(folder: vscode.WorkspaceFolder, globPattern: string, excludePattern?: string, maxResults: number = FILE_SEARCH_MAX_RESULT): Promise<vscode.Uri[]> {
    return await vscode.workspace.findFiles(new vscode.RelativePattern(folder, globPattern), excludePattern ? new vscode.RelativePattern(folder, excludePattern) : undefined, maxResults, undefined);
}

export function createFileItem(rootFolder: vscode.WorkspaceFolder, uri: vscode.Uri): Item {
    const relativeFilePath = path.join(".", uri.fsPath.substr(rootFolder.uri.fsPath.length));

    return <Item>{
        description: undefined,
        relativeFilePath: relativeFilePath,
        label: relativeFilePath,
        relativeFolderPath: path.dirname(relativeFilePath),
        absoluteFilePath: uri.fsPath,
        absoluteFolderPath: rootFolder.uri.fsPath,
    };
}

function getDockerFileGlobPatterns(): string[] {
    return getGlobPatterns([DOCKERFILE_GLOB_PATTERN], 'dockerfile');
}

function getDockerComposeFileGlobPatterns(): string[] {
    return getGlobPatterns([COMPOSE_FILE_GLOB_PATTERN], 'dockercompose');
}

function getGlobPatterns(globPatterns: string[], languageId: string): string[] {
    const result: string[] = globPatterns;
    try {
        const config = vscode.workspace.getConfiguration('files').get<unknown>('associations');
        if (config) {
            for (const globPattern of Object.keys(config)) {
                const associationLanguageId = <string | undefined>config[globPattern];
                if (languageId.toLowerCase() === associationLanguageId.toLowerCase()) {
                    result.push(globPattern);
                }
            }
        }
    } catch {
        // ignore and use default
    }
    return result;
}

export async function resolveFilesOfPattern(rootFolder: vscode.WorkspaceFolder, filePatterns: string[], excludePattern?: string, maxResults?: number)
    : Promise<Item[] | undefined> {
    let uris: vscode.Uri[] = [];
    await Promise.all(filePatterns.map(async (pattern: string) => {
        uris.push(...await getFileUris(rootFolder, pattern, excludePattern, maxResults));
    }));
    // de-dupe
    uris = uris.filter((uri, index) => uris.findIndex(uri2 => uri.toString() === uri2.toString()) === index);

    if (!uris || uris.length === 0) {
        return undefined;
    } else {
        return uris.map(uri => createFileItem(rootFolder, uri));
    }
}

async function quickPickFileItem(context: IActionContext, items: Item[], message: string): Promise<Item | undefined> {
    if (items) {
        if (items.length === 1) {
            return items[0];
        } else {
            return await context.ui.showQuickPick<Item>(items, { placeHolder: message });
        }
    }

    return undefined;
}

export async function quickPickDockerFileItem(context: IActionContext, dockerFileUri: vscode.Uri | undefined, rootFolder: vscode.WorkspaceFolder): Promise<Item> {
    if (dockerFileUri) {
        return createFileItem(rootFolder, dockerFileUri);
    }

    let selectedDockerFile: Item;
    const globPatterns: string[] = getDockerFileGlobPatterns();

    while (!selectedDockerFile) {
        const dockerFiles: Item[] | undefined = await resolveFilesOfPattern(rootFolder, globPatterns);
        const message = vscode.l10n.t('Choose a Dockerfile to build.');
        selectedDockerFile = await quickPickFileItem(context, dockerFiles, message);
        if (!selectedDockerFile) {
            const msg = vscode.l10n.t('Couldn\'t find a Dockerfile in your workspace. Would you like to add Docker files to the workspace?');
            await context.ui.showWarningMessage(msg, { stepName: msg }, DialogResponses.yes, DialogResponses.cancel);
            // The scaffolding command prompts using an action context of its own, so the outer wizard--if any--
            // must be told not to treat its loading prompt being hidden as a cancellation
            await suppressOuterLoadingPrompt(context, async () => vscode.commands.executeCommand('vscode-containers.configure'));
            // Try again
        }
    }
    return selectedDockerFile;
}

export async function quickPickDockerComposeFileItem(context: IActionContext, rootFolder: vscode.WorkspaceFolder, message: string): Promise<Item | undefined> {
    let selectedComposeFile: Item;
    const globPatterns: string[] = getDockerComposeFileGlobPatterns();

    while (!selectedComposeFile) {
        const composeFiles: Item[] | undefined = await resolveFilesOfPattern(rootFolder, globPatterns);
        if (composeFiles) {
            if ((composeFiles.length === 1 && isDefaultDockerComposeFile(composeFiles[0].label))
                || (composeFiles.length === 2 && composeFiles.some(i => isDefaultDockerComposeFile(i.label)) && composeFiles.some(i => isDefaultDockerComposeOverrideFile(i.label)))) {
                // if the current set of docker files contain only compose.yaml or compose.yaml with override file,
                // don't ask user for a docker file and let docker-compose automatically pick these files.
                return undefined;
            } else {
                selectedComposeFile = await quickPickFileItem(context, composeFiles, message);
            }
        } else {
            const msg = vscode.l10n.t('Couldn\'t find any docker-compose files in your workspace. Would you like to add Docker files to the workspace?');
            await context.ui.showWarningMessage(msg, { stepName: msg }, DialogResponses.yes, DialogResponses.cancel);
            // See the note in `quickPickDockerFileItem`
            await suppressOuterLoadingPrompt(context, async () => vscode.commands.executeCommand('vscode-containers.configureCompose'));
            // Try again
        }
    }
    return selectedComposeFile;
}

function isDefaultDockerComposeFile(fileName: string): boolean {
    if (fileName) {
        const lowerCasefileName: string = fileName.toLowerCase();
        return lowerCasefileName === 'compose.yaml' || lowerCasefileName === 'docker-compose.yml' || lowerCasefileName === 'docker-compose.yaml' || lowerCasefileName === 'compose.yml';
    }

    return false;
}

function isDefaultDockerComposeOverrideFile(fileName: string): boolean {
    if (fileName) {
        const lowerCasefileName: string = fileName.toLowerCase();
        return lowerCasefileName === 'compose.override.yaml' || lowerCasefileName === 'docker-compose.override.yml' || lowerCasefileName === 'docker-compose.override.yaml' || lowerCasefileName === 'compose.override.yml';
    }

    return false;
}

export async function quickPickYamlFileItem(context: IActionContext, fileUri: vscode.Uri, rootFolder: vscode.WorkspaceFolder, noYamlFileMessage: string): Promise<Item> {
    if (fileUri) {
        return createFileItem(rootFolder, fileUri);
    }

    const items: Item[] = await resolveFilesOfPattern(rootFolder, [YAML_GLOB_PATTERN]);
    const fileItem: Item = await quickPickFileItem(context, items, vscode.l10n.t('Choose a .yaml file to run.'));

    if (!fileItem) {
        throw new Error(noYamlFileMessage);
    }
    return fileItem;
}

export async function quickPickProjectFileItem(context: IActionContext, fileUri: vscode.Uri, rootFolder: vscode.WorkspaceFolder, noProjectFileMessage: string, includeFileBasedApps?: boolean): Promise<Item> {
    if (fileUri) {
        return createFileItem(rootFolder, fileUri);
    }

    let items: Item[] = await resolveFilesOfPattern(rootFolder, [CSPROJ_GLOB_PATTERN, FSPROJ_GLOB_PATTERN]);

    // If there are no project files and file-based apps are allowed, fall back to offering the .cs files in the workspace
    // (excluding bin/obj so generated .cs files don't show up in the pick).
    let usingFileBasedApps = false;
    if (!items && includeFileBasedApps) {
        items = await resolveFilesOfPattern(rootFolder, [CS_GLOB_PATTERN], NET_BUILD_OUTPUT_EXCLUDE_PATTERN);
        usingFileBasedApps = !!items;
    }

    // Use a distinct placeholder when offering file-based apps (.cs files), since "project file" is misleading for them.
    // These are intentionally two separate l10n.t calls so each generates its own string ID.
    const placeHolder = usingFileBasedApps
        ? vscode.l10n.t('Choose a file-based app.')
        : vscode.l10n.t('Choose a project file.');

    const fileItem: Item = await quickPickFileItem(context, items, placeHolder);

    if (!fileItem) {
        throw new Error(noProjectFileMessage);
    }
    return fileItem;
}
