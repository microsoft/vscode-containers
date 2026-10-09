/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandLineArgs, ShellQuoting } from '@microsoft/vscode-processutils';
import { ext } from '../../extensionVariables';
import { isComposeV2ableOrchestratorClient } from '../../runtimes/OrchestratorRuntimeManager';
import { getComposeServiceName } from '../../utils/composeLabels';
import { execAsync } from '../../utils/execAsync';
import { ContainerTreeItem } from './ContainerTreeItem';

/**
 * Gets the compose service name from a ContainerTreeItem.
 */
export function getComposeContainerServiceName(container: ContainerTreeItem): string | undefined {
    return getComposeServiceName(container.labels);
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

        const { stdout } = await execAsync(client.commandName, args, {
            cwd: workingDirectory,
            allowUnsafeExecutablePath: true,
        });

        if (!stdout) {
            return undefined;
        }

        // Extract JSON to avoid SyntaxError if docker compose prints warnings (like 'Found orphan containers') to stdout
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
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

        return foundProfiles ? serviceProfiles : undefined;
    } catch (err) {
        ext.outputChannel.debug(`Failed to resolve compose profiles: ${String(err)}`);
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
