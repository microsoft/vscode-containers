/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseError } from '@microsoft/vscode-azext-utils';
import { normalizeContainerOS } from '@microsoft/vscode-container-client';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceFolder, l10n } from 'vscode';
import { getContainerSecretsFolders, getHostSecretsFolders } from '../../debugging/netcore/AspNetSslHelper';
import { NetCoreDebugOptions } from '../../debugging/netcore/NetCoreDebugHelper';
import { vsDbgInstallBasePath } from '../../debugging/netcore/VsDbgHelper';
import { ext } from '../../extensionVariables';
import { PlatformOS } from '../../utils/platform';
import { quickPickProjectFileItem } from '../../utils/quickPickFile';
import { resolveVariables, unresolveWorkspaceFolder } from '../../utils/resolveVariables';
import { DockerBuildOptions, DockerBuildTaskDefinitionBase } from '../DockerBuildTaskDefinitionBase';
import { DockerBuildTaskDefinition } from '../DockerBuildTaskProvider';
import { DockerContainerVolume, DockerRunOptions, DockerRunTaskDefinitionBase } from '../DockerRunTaskDefinitionBase';
import { DockerRunTaskDefinition } from '../DockerRunTaskProvider';
import { DockerBuildTaskContext, DockerRunTaskContext, DockerTaskContext, DockerTaskScaffoldContext, TaskHelper, addVolumeWithoutConflicts, getDefaultContainerName, getDefaultImageName, inferImageName } from '../TaskHelper';
import { updateBlazorManifest } from './updateBlazorManifest';

export interface NetCoreTaskOptions {
    appProject?: string;
    configureSsl?: boolean;
    enableDebugging?: boolean;
}

export interface NetCoreBuildTaskDefinition extends DockerBuildTaskDefinitionBase {
    netCore?: NetCoreTaskOptions;
}

export interface NetCoreRunTaskDefinition extends DockerRunTaskDefinitionBase {
    netCore?: NetCoreTaskOptions;
}

export interface NetCoreTaskScaffoldingOptions {
    appProject?: string;
    platformOS?: PlatformOS;
}

const UserSecretsRegex = /UserSecretsId/i;

export class NetCoreTaskHelper implements TaskHelper {
    public async provideDockerBuildTasks(context: DockerTaskScaffoldContext, options?: NetCoreTaskScaffoldingOptions): Promise<DockerBuildTaskDefinition[]> {
        options = options || {};
        options.appProject = options.appProject || await NetCoreTaskHelper.inferAppProject(context); // This method internally checks the user-defined input first

        return [
            {
                type: 'docker-build',
                label: 'docker-build: debug',
                dependsOn: ['build'],
                dockerBuild: {
                    tag: getDefaultImageName(context.folder.name, 'dev'),
                    target: 'base',
                    dockerfile: unresolveWorkspaceFolder(context.dockerfile, context.folder),
                    context: '${workspaceFolder}',
                    pull: true
                },
                netCore: {
                    appProject: unresolveWorkspaceFolder(options.appProject, context.folder)
                }
            },
            {
                type: 'docker-build',
                label: 'docker-build: release',
                dependsOn: ['build'],
                dockerBuild: {
                    tag: getDefaultImageName(context.folder.name, 'latest'), // The 'latest' here is redundant but added to differentiate from above's 'dev'
                    dockerfile: unresolveWorkspaceFolder(context.dockerfile, context.folder),
                    context: '${workspaceFolder}',
                    platform: {
                        os: normalizeContainerOS(options?.platformOS),
                        architecture: 'amd64'
                    },
                    pull: true
                },
                netCore: {
                    appProject: unresolveWorkspaceFolder(options.appProject, context.folder)
                }
            }
        ];
    }

    public async provideDockerRunTasks(context: DockerTaskScaffoldContext, options?: NetCoreTaskScaffoldingOptions): Promise<DockerRunTaskDefinition[]> {
        options = options || {};
        options.appProject = options.appProject || await NetCoreTaskHelper.inferAppProject(context); // This method internally checks the user-defined input first
        options.platformOS = options.platformOS || 'Linux';

        // If there's exactly one port and it's 80, then set configureSsl to false, otherwise leave it undefined
        const configureSsl: false | undefined = context.ports?.length === 1 && context.ports?.[0] === 80 ? false : undefined;

        return [
            {
                type: 'docker-run',
                label: 'docker-run: debug',
                dependsOn: ['docker-build: debug'],
                dockerRun: {
                    os: options.platformOS === 'Windows' ? 'Windows' : undefined, // Default is Linux so we'll leave it undefined for brevity
                },
                netCore: {
                    appProject: unresolveWorkspaceFolder(options.appProject, context.folder),
                    enableDebugging: true,
                    configureSsl: configureSsl,
                }
            },
            {
                type: 'docker-run',
                label: 'docker-run: release',
                dependsOn: ['docker-build: release'],
                dockerRun: {
                    os: options.platformOS === 'Windows' ? 'Windows' : undefined, // Default is Linux so we'll leave it undefined for brevity
                },
                netCore: {
                    appProject: unresolveWorkspaceFolder(options.appProject, context.folder)
                }
            }
        ];
    }

    public async getDockerBuildOptions(context: DockerBuildTaskContext, buildDefinition: NetCoreBuildTaskDefinition): Promise<DockerBuildOptions> {
        const buildOptions = buildDefinition.dockerBuild;

        buildOptions.context = buildOptions.context || '${workspaceFolder}';
        buildOptions.dockerfile = buildOptions.dockerfile || path.join('${workspaceFolder}', 'Dockerfile');
        buildOptions.tag = buildOptions.tag || getDefaultImageName(context.folder.name);

        return buildOptions;
    }

    public async getDockerRunOptions(context: DockerRunTaskContext, runDefinition: NetCoreRunTaskDefinition): Promise<DockerRunOptions> {
        const runOptions = runDefinition.dockerRun;
        const helperOptions = runDefinition.netCore || {};

        helperOptions.appProject = await NetCoreTaskHelper.inferAppProject(context, helperOptions); // This method internally checks the user-defined input first

        runOptions.containerName = runOptions.containerName || getDefaultContainerName(context.folder.name);
        runOptions.os = runOptions.os || 'Linux';
        runOptions.image = inferImageName(runDefinition as DockerRunTaskDefinition, context, context.folder.name, 'dev');
        if (helperOptions.enableDebugging) {
            runOptions.entrypoint ??= runOptions.os === 'Windows' ? 'cmd.exe' : '/bin/sh';
        }

        const ssl = !!helperOptions.configureSsl; // SSL will be enabled only if helperOptions.configureSsl is explicitly true
        context.actionContext.telemetry.properties.netCoreSslSetting = helperOptions.configureSsl === undefined ? 'undefined' : helperOptions.configureSsl.toString();
        const userSecrets = ssl === true ? true : await this.inferUserSecrets(helperOptions);

        runOptions.env = runOptions.env || {};
        runOptions.env.DOTNET_USE_POLLING_FILE_WATCHER = runOptions.env.DOTNET_USE_POLLING_FILE_WATCHER || '1';
        runOptions.env.ASPNETCORE_ENVIRONMENT = runOptions.env.ASPNETCORE_ENVIRONMENT || 'Development';

        runOptions.volumes = await this.inferVolumes(context.folder, runOptions, helperOptions, ssl, userSecrets); // Volumes specifically are unioned with the user input (their input does not override except where the container path is the same)

        return runOptions;
    }

    public async postRun(context: DockerRunTaskContext, runDefinition: DockerRunTaskDefinition): Promise<void> {
        try {
            if (runDefinition.netCore.enableDebugging &&
                await NetCoreTaskHelper.isWebApp(runDefinition.netCore.appProject)) {
                await updateBlazorManifest(context, runDefinition);
            }
        } catch (err) {
            context.terminal.writeWarningLine(l10n.t('Failed to update Blazor static web assets manifest. Static web assets may not work.\nThe error was: {0}', parseError(err).message));
        }
    }

    public static async inferAppProject(context: DockerTaskContext, helperOptions?: NetCoreTaskOptions | NetCoreDebugOptions): Promise<string> {
        let result: string;

        if (helperOptions && helperOptions.appProject) {
            result = resolveVariables(helperOptions.appProject, context.folder);
        } else {
            // Find a .csproj or .fsproj in the folder
            const item = await quickPickProjectFileItem(context.actionContext, undefined, context.folder, l10n.t('No .NET project file (.csproj or .fsproj) could be found.'));
            result = item.absoluteFilePath;
        }

        return result;
    }

    public static async isWebApp(appProject: string): Promise<boolean> {
        const projectContents = await fse.readFile(appProject);

        return /Sdk\s*=\s*"Microsoft\.NET\.Sdk\.Web"/ig.test(projectContents.toString());
    }

    private async inferUserSecrets(helperOptions: NetCoreTaskOptions): Promise<boolean> {
        const contents = await fse.readFile(helperOptions.appProject);
        // Remove comments so we don't match a commented tag
        const noComments = contents.toString().replace(/<!--.*?-->/gs, "");
        return UserSecretsRegex.test(noComments);
    }

    private async inferVolumes(folder: WorkspaceFolder, runOptions: DockerRunOptions, helperOptions: NetCoreTaskOptions, ssl: boolean, userSecrets: boolean): Promise<DockerContainerVolume[]> {
        const volumes: DockerContainerVolume[] = [];

        if (runOptions.volumes) {
            for (const volume of runOptions.volumes) {
                addVolumeWithoutConflicts(volumes, volume);
            }
        }

        if (helperOptions.enableDebugging) {
            const appVolume: DockerContainerVolume = {
                localPath: path.dirname(helperOptions.appProject),
                containerPath: runOptions.os === 'Windows' ? 'C:\\app' : '/app',
                permissions: 'rw'
            };

            const srcVolume: DockerContainerVolume = {
                localPath: folder.uri.fsPath,
                containerPath: runOptions.os === 'Windows' ? 'C:\\src' : '/src',
                permissions: 'rw'
            };

            const debuggerVolume: DockerContainerVolume = {
                localPath: vsDbgInstallBasePath,
                containerPath: runOptions.os === 'Windows' ? 'C:\\remote_debugger' : '/remote_debugger',
                permissions: 'ro'
            };

            const nugetRootVolume: DockerContainerVolume = {
                localPath: path.join(os.homedir(), '.nuget', 'packages'),
                containerPath: runOptions.os === 'Windows' ? 'C:\\.nuget\\packages' : '/root/.nuget/packages',
                permissions: 'ro'
            };

            const nugetUserVolume: DockerContainerVolume = {
                localPath: nugetRootVolume.localPath, // Same local path as the root one
                containerPath: runOptions.os === 'Windows' ? 'C:\\Users\\ContainerUser\\.nuget\\packages' : '/home/appuser/.nuget/packages',
                permissions: 'ro'
            };

            const nugetDefaultUserVolume: DockerContainerVolume = {
                localPath: nugetRootVolume.localPath, // Same local path as the root one
                containerPath: runOptions.os === 'Windows' ? 'C:\\Users\\ContainerUser\\.nuget\\packages' : '/home/app/.nuget/packages',
                permissions: 'ro'
            };

            addVolumeWithoutConflicts(volumes, appVolume);
            addVolumeWithoutConflicts(volumes, srcVolume);
            addVolumeWithoutConflicts(volumes, debuggerVolume);
            if (await fse.pathExists(nugetRootVolume.localPath)) {
                addVolumeWithoutConflicts(volumes, nugetRootVolume);
            }
            if (await fse.pathExists(nugetUserVolume.localPath)) {
                addVolumeWithoutConflicts(volumes, nugetUserVolume);
            }
            if (await fse.pathExists(nugetDefaultUserVolume.localPath)) {
                addVolumeWithoutConflicts(volumes, nugetDefaultUserVolume);
            }
        }

        if (userSecrets || ssl) {
            // Try to get a container username from the image (best effort only)
            let userName: string | undefined;
            try {
                const imageInspection = (await ext.runWithDefaults(client =>
                    client.inspectImages({ imageRefs: [runOptions.image] })
                ))?.[0];
                userName = imageInspection?.user;
            } catch {
                // Best effort
            }

            const hostSecretsFolders = getHostSecretsFolders();
            const containerSecretsFolders = getContainerSecretsFolders(runOptions.os, userName);

            const userSecretsVolume: DockerContainerVolume = {
                localPath: hostSecretsFolders.hostUserSecretsFolder,
                containerPath: containerSecretsFolders.containerUserSecretsFolder,
                permissions: 'ro'
            };

            addVolumeWithoutConflicts(volumes, userSecretsVolume);

            if (ssl) {
                const certVolume: DockerContainerVolume = {
                    localPath: hostSecretsFolders.hostCertificateFolder,
                    containerPath: containerSecretsFolders.containerCertificateFolder,
                    permissions: 'ro'
                };

                addVolumeWithoutConflicts(volumes, certVolume);
            }
        }

        return volumes;
    }
}

export const netCoreTaskHelper = new NetCoreTaskHelper();
