/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { CommandLineArgs, ShellQuoting } from '@microsoft/vscode-processutils';
import { ext } from '../../extensionVariables';
import { isComposeV2ableOrchestratorClient } from '../../runtimes/OrchestratorRuntimeManager';
import { execAsync } from '../../utils/execAsync';
import { ContainerTreeItem } from './ContainerTreeItem';

/**
 * Extracts the list of compose config source files from a container's labels.
 * Uses the `com.docker.compose.project.config_files` label which Docker Compose sets
 * on all containers it manages.
 */
export function getComposeSourceFiles(labels: { [key: string]: string }): string[] | undefined {
    return labels['com.docker.compose.project.config_files']
        ?.split(',')
        ?.map(f => path.isAbsolute(f) ? f : path.parse(f).base)
        ?.filter(file => !!file);
}

/**
 * Gets the compose service name from a ContainerTreeItem.
 */
export function getComposeContainerServiceName(container: ContainerTreeItem): string | undefined {
    return container.labels?.['com.docker.compose.service'] || undefined;
}

/**
 * Builds a map of service name -> list of profiles for a compose project.
 *
 * This uses `docker compose config --format json` to get the normalized compose
 * configuration (including all profile assignments) without needing to parse
 * YAML files directly. Falls back gracefully if the command fails or `--format json`
 * isn't supported (Docker Compose < v2.15).
 *
 * @param workingDirectory  The working directory to run the compose command from
 * @param composeFiles      Absolute paths to the compose files
 * @param projectName       The compose project name (used for `--project-name`)
 * @returns Map of service name -> profile list, or undefined if no profiles are defined
 *          or if the config cannot be fetched (older compose versions, unsupported runtimes).
 */
export async function getComposeServiceProfiles(
    workingDirectory: string,
    composeFiles: string[],
    projectName?: string,
): Promise<Map<string, string[]> | undefined> {
    try {
        const client = await ext.orchestratorManager.getClient();
        // Determine if the client uses the V2 `compose` subcommand style (e.g. `docker compose`)
        const isV2 = isComposeV2ableOrchestratorClient(client) ? client.composeV2 : false;

        // Build the args for `docker compose config --format json`
        // We strongly quote '*' to prevent the shell from expanding it to local filenames.
        const args: CommandLineArgs = [
            // V2 clients (docker, podman) need the 'compose' subcommand inserted
            ...(isV2 ? ['compose'] : []),
            '--profile', { value: '*', quoting: ShellQuoting.Strong },
            ...composeFiles.flatMap(f => ['--file', f]),
            ...(projectName ? ['--project-name', projectName] : []),
            'config',
            '--format',
            'json',
        ];

        ext.outputChannel.debug(`getComposeServiceProfiles args: ${client.commandName} ${JSON.stringify(args)} in cwd: ${workingDirectory}`);

        const { stdout } = await execAsync(client.commandName, args, {
            cwd: workingDirectory,
            allowUnsafeExecutablePath: true,
        });

        ext.outputChannel.debug(`getComposeServiceProfiles stdout length: ${stdout?.length ?? 0}`);

        if (!stdout) {
            ext.outputChannel.debug('getComposeServiceProfiles stdout was empty.');
            return undefined;
        }

        // Extract JSON to avoid SyntaxError if docker compose prints warnings (like 'Found orphan containers') to stdout
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            ext.outputChannel.debug('getComposeServiceProfiles failed to find JSON in stdout.');
            return undefined;
        }

        const config = JSON.parse(jsonMatch[0]) as {
            services?: {
                [name: string]: {
                    profiles?: string[];
                };
            };
        };

        if (!config.services) {
            ext.outputChannel.debug('getComposeServiceProfiles JSON did not contain \'services\' property.');
            return undefined;
        }

        const serviceProfiles = new Map<string, string[]>();
        let foundProfiles = false;

        for (const [serviceName, serviceDef] of Object.entries(config.services)) {
            const profiles = (serviceDef.profiles ?? []).filter(p => !!p);
            serviceProfiles.set(serviceName, profiles);
            if (profiles.length > 0) {
                foundProfiles = true;
            }
        }

        ext.outputChannel.debug(`getComposeServiceProfiles foundProfiles: ${foundProfiles}`);
        return foundProfiles ? serviceProfiles : undefined;
    } catch (err) {
        ext.outputChannel.debug(`getComposeServiceProfiles failed: ${String(err)}`);
        // The `--format json` flag requires Docker Compose v2.15+; if it fails (older versions,
        // unsupported runtimes, JSON parse errors, etc.) we fall back to flat service listing
        // with no profile grouping.
        return undefined;
    }
}

/**
 * Returns the list of compose profiles for the service that backs a given container.
 */
export function getComposeProfilesForContainer(container: ContainerTreeItem, serviceProfiles: Map<string, string[]>): string[] {
    const serviceName = getComposeContainerServiceName(container);
    if (!serviceName) {
        return [];
    }

    return serviceProfiles.get(serviceName) ?? [];
}
