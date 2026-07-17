/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IContainersClient, ListContainersItem } from '../contracts/ContainerClient';
import type { ICommandRunnerFactory } from '../contracts/CommandRunner';

export type ClientType = 'docker' | 'podman' | 'finch' | 'nerdctl';

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

export async function validateContainerExists(client: IContainersClient, runner: ICommandRunnerFactory, reference: { containerId?: string, containerName?: string }): Promise<ListContainersItem | undefined> {
    const containers = await runner.getCommandRunner()(
        client.listContainers({ all: true })
    );

    if (reference.containerId) {
        return containers.find(c => c.id === reference.containerId);
    } else if (reference.containerName) {
        return containers.find(c => c.name === reference.containerName);
    }

    throw new Error('Either containerId or containerName must be provided');
}
