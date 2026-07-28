/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { normalizeCommandResponseLike } from '@microsoft/vscode-container-client';
import { DebugAdapterDescriptor, DebugAdapterDescriptorFactory, DebugAdapterExecutable, DebugSession, l10n } from 'vscode';
import { ext } from '../../extensionVariables';
import { ResolvedDebugConfiguration } from '../DebugHelper';

// The debug type used for Python container debugging over stdio. Must match the type
// contributed in package.json under `contributes.debuggers` and the type set by
// PythonDebugHelper on the resolved debug configuration.
export const PythonContainerDebugType = 'python-container';

// The path where the Python extension's bundled debugpy package is mounted inside the container.
// Kept in sync with PythonTaskHelper, which mounts the debugger folder there.
const containerDebugpyPath = '/debugpy';

/**
 * Provides a debug adapter that runs debugpy's DAP adapter *inside* the container and
 * communicates over stdio via `<runtime> exec -i <container> <python> /debugpy/adapter`.
 *
 * This is analogous to how the .NET debugger (vsdbg) is run in the container via a pipe
 * transport, and avoids any host<->container networking (which does not work reliably with
 * Podman, where `host.docker.internal` and the default `bridge` network are unavailable).
 */
export class PythonContainerDebugAdapterDescriptorFactory implements DebugAdapterDescriptorFactory {
    public async createDebugAdapterDescriptor(session: DebugSession): Promise<DebugAdapterDescriptor> {
        const configuration = session.configuration as ResolvedDebugConfiguration;
        const containerName = configuration.dockerOptions?.containerName;

        if (!containerName) {
            throw new Error(l10n.t('No container name was resolved for Python container debugging.'));
        }

        // debugpy speaks DAP over stdio when its adapter is launched without a `--port` argument.
        // The debuggee interpreter (`python`) is also used to run the adapter itself.
        const python = configuration.python || 'python3';

        // Build the `exec` invocation using the active container runtime client so the command and
        // its arguments are shaped correctly for whichever runtime (Docker, Podman, etc.) is in use,
        // rather than hardcoding runtime-specific flags here.
        const client = await ext.runtimeManager.getClient();
        const commandResponse = await normalizeCommandResponseLike(
            client.execContainer({
                container: containerName,
                interactive: true,
                command: [python, `${containerDebugpyPath}/adapter`],
            })
        );

        // DebugAdapterExecutable spawns the process directly (no shell), so flatten any
        // ShellQuotedString arguments down to their raw string values.
        const args = commandResponse.args.map((arg) => typeof arg === 'string' ? arg : arg.value);

        return new DebugAdapterExecutable(commandResponse.command, args);
    }
}
