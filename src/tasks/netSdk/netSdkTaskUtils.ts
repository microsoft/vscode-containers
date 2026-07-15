/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerClient, PodmanClient, RunContainerBindMount, RunContainerCommandOptions, WslcClient } from "@microsoft/vscode-container-client";
import { CommandLineArgs, composeArgs, withArg, withNamedArg } from '@microsoft/vscode-processutils';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { configPrefix } from "../../constants";
import { vsDbgInstallBasePath } from "../../debugging/netcore/VsDbgHelper";
import { ext } from "../../extensionVariables";
import { getImageNameWithTag } from "../../utils/getValidImageName";
import { getDockerOSType } from "../../utils/osUtils";
import { defaultVsCodeLabels } from "../TaskDefinitionBase";
import { getDefaultContainerName } from '../TaskHelper';

/**
 * Native architecture of the current machine in the RID format
 * {@link https://github.com/dotnet/runtime/blob/main/src/libraries/Microsoft.NETCore.Platforms/src/runtime.json}
 */
export type RidCpuArchitecture =
    | 'x64'
    | 'x86'
    | 'arm64'
    | 'arm'
    | 'ppc64le'
    | 'mips64'
    | 's390x'
    | string;

export const NetSdkRunTaskType = 'dotnet-container-sdk';
const NetSdkDefaultImageTag = 'dev'; // intentionally default to dev tag for phase 1 of this feature

export async function getNetSdkBuildCommand(archiveOutputPath?: string): Promise<{ command: string, args: CommandLineArgs }> {
    const args = composeArgs(
        withArg('publish'),
        withNamedArg('--os', await normalizeOsToRidOs()),
        withNamedArg('--arch', await normalizeArchitectureToRidArchitecture()),
        withArg('/t:PublishContainer'),
        withNamedArg('--configuration', 'Debug'),
        withNamedArg('-p:ContainerImageTag', NetSdkDefaultImageTag, { assignValue: true }),
        // wslc can't be a .NET SDK `LocalRegistry` target. When an archive path is provided (wslc),
        // publish the image to that tar so it can be loaded separately; otherwise load it directly
        // into the runtime via `LocalRegistry`.
        archiveOutputPath
            ? withNamedArg('-p:ContainerArchiveOutputPath', archiveOutputPath, { assignValue: true })
            : withNamedArg('-p:LocalRegistry', getLocalRegistry(), { assignValue: true }),
    )();

    return { command: 'dotnet', args: args };
}

/**
 * Builds the command that loads the tar archive produced by {@link getNetSdkBuildCommand} into
 * the selected runtime. Only needed for wslc, which cannot be targeted directly by the .NET SDK's
 * `LocalRegistry` property.
 */
export async function getNetSdkLoadCommand(archiveInputPath: string): Promise<{ command: string, args: CommandLineArgs }> {
    const client = await ext.runtimeManager.getClient();
    const args = composeArgs(
        withArg('load'),
        withNamedArg('--input', archiveInputPath),
    )();

    return { command: client.commandName, args: args };
}

export async function getNetSdkRunCommand(imageName: string): Promise<{ command: string, args: CommandLineArgs }> {
    const client = await ext.runtimeManager.getClient();

    const options: RunContainerCommandOptions = {
        detached: true,
        publishAllPorts: true,
        name: getDefaultContainerName(imageName, NetSdkDefaultImageTag),
        environmentVariables: {},
        removeOnExit: true,
        imageRef: getImageNameWithTag(imageName, NetSdkDefaultImageTag),
        labels: defaultVsCodeLabels,
        mounts: await getRemoteDebuggerMount(),
        entrypoint: await getDockerOSType() === 'windows' ? 'cmd.exe' : '/bin/sh'
    };

    const commandResponse = await client.runContainer(options);
    return { command: commandResponse.command, args: commandResponse.args };
}

/**
 * This method normalizes the Docker OS type to match the .NET Core SDK conventions.
 * {@link https://learn.microsoft.com/en-us/dotnet/core/rid-catalog}
 */
export async function normalizeOsToRidOs(): Promise<'linux' | 'win'> {
    const dockerOsType = await getDockerOSType();
    return dockerOsType === 'windows' ? 'win' : 'linux';
}

/**
 * This method normalizes the native architecture to match the .NET Core SDK conventions.
 * {@link https://learn.microsoft.com/en-us/dotnet/core/rid-catalog}
 */
export async function normalizeArchitectureToRidArchitecture(): Promise<RidCpuArchitecture> {
    const architecture = os.arch();
    switch (architecture) {
        case 'x32':
        case 'ia32':
            return 'x86';
        default:
            return architecture;
    }
}

/**
 * This method gets the local registry to push the image to after it is built. It can be either
 * "Docker", "Podman", or undefined to allow the .NET SDK to choose on its own.
 * See https://learn.microsoft.com/en-us/dotnet/core/containers/publish-configuration#localregistry
 */
function getLocalRegistry(): 'Docker' | 'Podman' | undefined {
    switch (getSelectedContainerClientId()) {
        case DockerClient.ClientId:
            return 'Docker';
        case PodmanClient.ClientId:
            return 'Podman';
        default:
            return undefined;
    }
}

function getSelectedContainerClientId(): string {
    const config = vscode.workspace.getConfiguration(configPrefix);
    return config.get<string>('containerClient', '');
}

/**
 * Whether the wslc runtime is the selected container client. wslc cannot be a .NET SDK
 * `LocalRegistry` target, so the build/run task publishes to a tar archive and loads it instead.
 */
export function isWslcRuntimeSelected(): boolean {
    return getSelectedContainerClientId() === WslcClient.ClientId;
}

/**
 * A unique temp path for the image tar archive the .NET SDK emits for wslc (via
 * `ContainerArchiveOutputPath`) and that the subsequent `wslc load` step reads. A GUID is
 * included to avoid collisions between concurrent or repeated task runs. The caller is
 * responsible for deleting the file once the load completes.
 */
export function getNetSdkImageArchivePath(imageName: string): string {
    const safeName = getImageNameWithTag(imageName, NetSdkDefaultImageTag).replace(/[^a-z0-9_.-]/gi, '_');
    return path.join(os.tmpdir(), `${safeName}-${crypto.randomUUID()}.tar`);
}

/**
 * This methods returns the mount for the remote debugger ONLY as the SDK built container will have
 * everything it needs to run the app already inside.
 */
async function getRemoteDebuggerMount(): Promise<RunContainerBindMount[] | undefined> {
    const debuggerVolume: RunContainerBindMount = {
        type: 'bind',
        source: vsDbgInstallBasePath,
        destination: await getDockerOSType() === 'windows' ? 'C:\\remote_debugger' : '/remote_debugger',
        readOnly: true
    };
    return [debuggerVolume];
}


