/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from "fs";
import * as path from "path";
import { CancellationToken, CustomExecution, Task, TaskDefinition, TaskScope } from "vscode";
import { DockerPseudoterminal } from "../DockerPseudoterminal";
import { DockerRunTask } from "../DockerRunTaskProvider";
import { DockerTaskProvider } from '../DockerTaskProvider';
import { DockerRunTaskContext } from '../TaskHelper';
import { NetCoreRunTaskDefinition } from "../netcore/NetCoreTaskHelper";
import { NetSdkRunTaskType, getNetSdkBuildCommand, getNetSdkImageArchivePath, getNetSdkLoadCommand, getNetSdkRunCommand, isWslcRuntimeSelected } from './netSdkTaskUtils';

const NetSdkDebugTaskName = 'debug';

export type NetSdkRunTaskDefinition = NetCoreRunTaskDefinition;

export class NetSdkRunTaskProvider extends DockerTaskProvider {

    public constructor() { super(NetSdkRunTaskType, undefined); }

    public provideTasks(token: CancellationToken): Task[] {
        return []; // this task is not discoverable this way
    }

    protected async executeTaskInternal(context: DockerRunTaskContext, task: DockerRunTask): Promise<void> {
        const projectPath = task.definition.netCore?.appProject;
        const projectFolderPath = path.dirname(projectPath);
        const imageName = task.definition.dockerRun.image;

        // wslc can't be a .NET SDK `LocalRegistry` target, so for wslc the image is published to a
        // temporary tar archive and loaded into the runtime before running. The path is generated
        // once (with a GUID to avoid collisions) and shared by the build and load steps.
        const imageArchivePath = isWslcRuntimeSelected() ? getNetSdkImageArchivePath(imageName) : undefined;

        try {
            // use dotnet to build the image
            const { command: buildCommand, args: buildArgs } = await getNetSdkBuildCommand(imageArchivePath);
            await context.terminal.execAsyncInTerminal(
                buildCommand,
                buildArgs,
                {
                    folder: context.folder,
                    token: context.cancellationToken,
                    cwd: projectFolderPath,
                }
            );

            // for wslc, load the tar archive produced by the build into the runtime
            if (imageArchivePath) {
                const { command: loadCommand, args: loadArgs } = await getNetSdkLoadCommand(imageArchivePath);
                await context.terminal.execAsyncInTerminal(
                    loadCommand,
                    loadArgs,
                    {
                        folder: context.folder,
                        token: context.cancellationToken,
                        cwd: projectFolderPath,
                    }
                );
            }

            // use docker run to run the image
            const { command: runCommand, args: runArgs } = await getNetSdkRunCommand(imageName);
            await context.terminal.execAsyncInTerminal(
                runCommand,
                runArgs,
                {
                    folder: context.folder,
                    token: context.cancellationToken,
                    cwd: projectFolderPath,
                }
            );
        } finally {
            // best-effort cleanup of the temporary image archive (wslc only)
            if (imageArchivePath) {
                await fs.rm(imageArchivePath, { force: true }).catch(() => { /* ignore cleanup failures */ });
            }
        }

        return Promise.resolve();
    }

    public createNetSdkRunTask(options?: Omit<NetSdkRunTaskDefinition, "type">): { task: Task, promise: Promise<number> } {
        let task: Task;
        const definition = {
            ...options,
            type: NetSdkRunTaskType,
        };

        const promise = new Promise<number>((resolve, reject) => {
            task = new Task(
                definition,
                TaskScope.Workspace,
                NetSdkDebugTaskName,
                NetSdkRunTaskType,
                new CustomExecution(async (resolveDefinition: TaskDefinition) => {
                    const pseudoTerminal = new DockerPseudoterminal(new NetSdkRunTaskProvider(), task, resolveDefinition);

                    const closeEventRegistration = pseudoTerminal.onDidClose((exitCode: number) => {
                        closeEventRegistration.dispose();

                        if (exitCode === 0) {
                            resolve(exitCode);
                        } else {
                            reject(exitCode);
                        }
                    });

                    return pseudoTerminal;
                }),
            );
        });

        return { task, promise };
    }
}

export const netSdkRunTaskProvider = new NetSdkRunTaskProvider();
