/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import type { ICommandRunnerFactory } from '../contracts/CommandRunner';
import type { IContainersClient, ListContainersItem } from '../contracts/ContainerClient';

export type ClientType = 'docker' | 'podman' | 'finch' | 'nerdctl' | 'wslc';

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

/**
 * Checks whether a single TCP port can be bound on the local machine.
 *
 * Binds to 127.0.0.1 rather than 0.0.0.0 so the probe never opens an
 * externally-reachable listener. This still detects the cases we care about:
 * Windows/WinNAT reserved port exclusions fail with EACCES on loopback just as
 * they do on the wildcard address, and a port already held by a wildcard
 * listener fails with EADDRINUSE.
 */
function isPortFree(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => server.close(() => resolve(true)));
        server.listen(port, '127.0.0.1');
    });
}

/**
 * Finds a run of `count` consecutive bindable TCP ports, starting the search at
 * `startPort`.
 *
 * The ports must be consecutive so that Docker reports them in its compacted
 * `<start>-<end>` form, which is what the port-range parsing is exercised
 * against. Hardcoding a range is not viable: Windows reserves large, shifting
 * blocks of ports for WinNAT/Hyper-V, so a fixed range binds fine on one machine
 * and fails with `docker run` exit code 125 on another (or after a reboot).
 */
export async function findConsecutiveFreePorts(count: number, startPort: number = 56000, maxPort: number = 65000): Promise<number[]> {
    let candidate = startPort;

    while (candidate + count - 1 <= maxPort) {
        let allFree = true;

        for (let offset = 0; offset < count; offset++) {
            if (!await isPortFree(candidate + offset)) {
                // Skip past the port that failed; Windows exclusions come in
                // contiguous blocks, so there is no point retrying inside one.
                candidate = candidate + offset + 1;
                allFree = false;
                break;
            }
        }

        if (allFree) {
            return Array.from({ length: count }, (_, i) => candidate + i);
        }
    }

    throw new Error(`Unable to find ${count} consecutive free ports between ${startPort} and ${maxPort}`);
}

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
