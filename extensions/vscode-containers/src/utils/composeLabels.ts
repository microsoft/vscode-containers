/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';

export const ComposeConfigFilesLabel = 'com.docker.compose.project.config_files';
export const ComposeProjectNameLabel = 'com.docker.compose.project';
export const ComposeWorkingDirLabel = 'com.docker.compose.project.working_dir';
export const ComposeEnvFileLabel = 'com.docker.compose.project.environment_file';
export const ComposeServiceLabel = 'com.docker.compose.service';

/**
 * Gets the list of compose configuration source files from container labels.
 * Normalized to filenames for relative paths to ensure consistency when running compose CLI commands.
 */
export function getComposeFiles(labels: { [key: string]: string } | undefined): string[] | undefined {
    if (!labels) {
        return undefined;
    }

    return labels[ComposeConfigFilesLabel]
        ?.split(',')
        ?.map(f => path.isAbsolute(f) ? f : path.parse(f).base)
        ?.filter(file => !!file);
}

/**
 * Gets the compose working directory from container labels.
 */
export function getComposeWorkingDirectory(labels: { [key: string]: string } | undefined): string | undefined {
    return labels?.[ComposeWorkingDirLabel] || undefined;
}

/**
 * Gets the compose project name from container labels.
 */
export function getComposeProjectName(labels: { [key: string]: string } | undefined): string | undefined {
    return labels?.[ComposeProjectNameLabel] || undefined;
}

/**
 * Gets the environment file path from container labels.
 */
export function getComposeEnvFile(labels: { [key: string]: string } | undefined): string | undefined {
    return labels?.[ComposeEnvFileLabel] || undefined;
}

/**
 * Gets the compose service name from container labels.
 */
export function getComposeServiceName(labels: { [key: string]: string } | undefined): string | undefined {
    return labels?.[ComposeServiceLabel] || undefined;
}
