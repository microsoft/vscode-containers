/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICommandRunnerFactory } from '../contracts/CommandRunner';
import type { IContainersClient, ListContainersItem } from '../contracts/ContainerClient';

export type ClientType = 'docker' | 'podman' | 'finch' | 'nerdctl' | 'wslc' | 'applecontainer';

/**
 * Shell command that keeps a container alive while responding to SIGTERM for a
 * fast shutdown. Used by the orchestrator E2E compose files, where the process
 * runs under `sh -c` without a TTY.
 *
 * NOTE: This is intentionally NOT used with `runContainer` (see
 * {@link KeepAliveEntrypoint}). `runContainer` allocates a TTY for detached runs,
 * and a non-interactive `sh -c <loop>` exits once that pseudo-TTY is torn down
 * after the CLI detaches.
 */
export const KeepAliveShellCommand = "trap 'exit 0' TERM; while true; do sleep 1; done";

function normalizeContainerNameForRuntimeComparison(name: string): string {
    // Compose implementations disagree on generated container-name separators:
    // Docker/nerdctl typically use hyphens, while podman-compose often uses underscores.
    // Case can also vary depending on project-name normalization.
    return name.toLowerCase().replaceAll('_', '-');
}

export async function validateContainerExists(client: IContainersClient, runner: ICommandRunnerFactory, reference: { containerId?: string, containerName?: string }): Promise<ListContainersItem | undefined> {
    const containers = await runner.getCommandRunner()(
        client.listContainers({ all: true })
    );

    if (reference.containerId) {
        return containers.find(c => c.id === reference.containerId);
    } else if (reference.containerName) {
        const containerName = reference.containerName;
        const normalizedContainerName = normalizeContainerNameForRuntimeComparison(containerName);
        return containers.find(c =>
            c.name === containerName ||
            normalizeContainerNameForRuntimeComparison(c.name) === normalizedContainerName
        );
    }

    throw new Error('Either containerId or containerName must be provided');
}
