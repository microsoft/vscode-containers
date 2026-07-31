/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceFolderPlaceholder } from '../../constants';
import { PythonExtensionHelper } from '../../tasks/python/PythonExtensionHelper';
import { PythonRunTaskDefinition } from '../../tasks/python/PythonTaskHelper';
import { PythonProjectType } from '../../utils/pythonUtils';
import { DebugHelper, DockerDebugContext, DockerDebugScaffoldContext, ResolvedDebugConfiguration, inferContainerName, resolveDockerServerReadyAction } from '../DebugHelper';
import { DockerDebugConfigurationBase } from '../DockerDebugConfigurationBase';
import { DockerDebugConfiguration } from '../DockerDebugConfigurationProvider';
import { PythonScaffoldingOptions } from '../DockerDebugScaffoldingProvider';
import { PythonContainerDebugType } from './PythonContainerDebugAdapterDescriptorFactory';

export interface PythonPathMapping {
    localRoot: string;
    remoteRoot: string;
}

export interface PythonDebugOptions {
    host?: string;
    port?: number;
    pathMappings?: PythonPathMapping[];
    justMyCode?: boolean;
    projectType?: PythonProjectType;
    django?: boolean;
    fastapi?: boolean;
    jinja?: boolean;
    args?: string[];
}

export interface PythonDockerDebugConfiguration extends DockerDebugConfigurationBase {
    python?: PythonDebugOptions;
}

export class PythonDebugHelper implements DebugHelper {
    public async provideDebugConfigurations(context: DockerDebugScaffoldContext, options?: PythonScaffoldingOptions): Promise<DockerDebugConfiguration[]> {
        // Capitalize the first letter.
        const projectType = options.projectType.charAt(0).toUpperCase() + options.projectType.slice(1);

        return [{
            name: `Containers: Python - ${projectType}`,
            type: 'docker',
            request: 'launch',
            preLaunchTask: 'docker-run: debug',
            python: {
                pathMappings: [
                    {
                        localRoot: WorkspaceFolderPlaceholder,
                        remoteRoot: '/app'
                    }
                ],
                projectType: options.projectType
            }
        }];
    }

    public async resolveDebugConfiguration(context: DockerDebugContext, debugConfiguration: PythonDockerDebugConfiguration): Promise<ResolvedDebugConfiguration | undefined> {
        const pyExt = await PythonExtensionHelper.getPythonExtension();
        if (!pyExt) {
            return undefined;
        }

        const containerName = inferContainerName(debugConfiguration, context, context.folder.name);
        const projectType = debugConfiguration.python.projectType;
        const pythonRunTaskOptions = (context.runDefinition as PythonRunTaskDefinition)?.python || {};

        const dockerServerReadyAction =
            resolveDockerServerReadyAction(
                debugConfiguration,
                {
                    containerName: containerName,
                    pattern: this.getServerReadyPattern(projectType),
                    uriFormat: '%s://localhost:%s'
                },
                true);

        const args = [...(debugConfiguration.python.args || pythonRunTaskOptions.args || [])];

        return {
            ...{ ...debugConfiguration, python: undefined }, // Get the original debug configuration, minus the "python" property which belongs to the Docker launch config and confuses debugpy
            type: PythonContainerDebugType,
            request: 'launch',
            pathMappings: debugConfiguration.python.pathMappings,
            // debugpy's DAP adapter runs *inside* the container (Linux), but the VS Code client runs
            // on the host. Tell debugpy which OS the client's paths use so it can correctly translate
            // breakpoint paths via `pathMappings` (e.g. Windows `d:\src\app.py` <-> container
            // `/app/app.py`). Without this, pydevd assumes the client OS matches the server (Linux)
            // and drive-letter casing/separators never match, so no breakpoint path is translated.
            clientOS: process.platform === 'win32' ? 'windows' : 'unix',
            justMyCode: debugConfiguration.python.justMyCode ?? true,
            django: debugConfiguration.python.django || projectType === 'django',
            fastapi: debugConfiguration.python.fastapi || projectType === 'fastapi',
            jinja: debugConfiguration.python.jinja || projectType === 'flask',
            dockerOptions: {
                containerName: containerName,
                dockerServerReadyAction: dockerServerReadyAction,
                removeContainerAfterDebug: debugConfiguration.removeContainerAfterDebug
            },
            // The debug adapter (debugpy) runs *inside* the container and communicates with VS Code
            // over stdio (see PythonContainerDebugAdapterDescriptorFactory). Because the adapter, the
            // debug server, and the debuggee all run in the container, no host<->container networking
            // is needed. We use the internal console so the adapter launches the debuggee itself in
            // the container rather than asking the local client to spawn it in a terminal.
            console: debugConfiguration.console || "internalConsole",
            internalConsoleOptions: debugConfiguration.internalConsoleOptions || "openOnSessionStart",
            module: debugConfiguration.module || pythonRunTaskOptions.module,
            program: debugConfiguration.file || pythonRunTaskOptions.file,
            redirectOutput: debugConfiguration.redirectOutput as boolean | undefined ?? true,
            args: args,
            cwd: '.',
            // The interpreter used by the in-container adapter to launch the application itself.
            // Since this is in the container it should always use `python3`.
            python: 'python3',
        };
    }

    private getServerReadyPattern(projectType: PythonProjectType): string | undefined {
        switch (projectType) {
            case 'django':
                return 'Starting development server at (https?://\\S+|[0-9]+)';
            case 'fastapi':
                return 'Uvicorn running on (https?://\\S+|[0-9]+)';
            case 'flask':
                return 'Running on (https?://\\S+|[0-9]+)';
            default:
                return undefined;
        }
    }
}

export const pythonDebugHelper = new PythonDebugHelper();
