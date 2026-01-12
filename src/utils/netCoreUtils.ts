/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseError } from '@microsoft/vscode-azext-utils';
import { CommandLineArgs, composeArgs, withArg, withQuotedArg } from '@microsoft/vscode-processutils';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';
import { execAsync } from './execAsync';

export interface NetCoreProjectInfo {
    assemblyName: string;
    targetFrameworks: string[];
    assemblyRelativeOutputPath: string;
    enableSdkContainerSupport: boolean;
    assemblyContainerPath: string | undefined;
    imageName: string | undefined;
}

const RawNetCoreProjectInfoSchema = z.object({
    Properties: z
        .object({
            AssemblyName: z.string().nonempty(vscode.l10n.t('AssemblyName must have a value')),
            OutputPath: z.string().nonempty(vscode.l10n.t('OutputPath must have a value')),
            TargetFramework: z.string().optional(),
            TargetFrameworks: z.string().optional(),
            EnableSdkContainerSupport: z.stringbool().optional(),
            ContainerWorkingDirectory: z.string().optional(),
            ContainerRepository: z.string().optional(),
            ContainerImageName: z.string().optional(),
        })
        .refine(info => info.TargetFramework || info.TargetFrameworks, vscode.l10n.t('Either TargetFramework or TargetFrameworks must have a value'))
        .refine(info => !info.EnableSdkContainerSupport || (info.ContainerWorkingDirectory && (info.ContainerRepository || info.ContainerImageName)), vscode.l10n.t('ContainerWorkingDirectory and either ContainerRepository or ContainerImageName must have values when EnableSdkContainerSupport is true'))
});

export interface BlazorManifestInfo {
    inputManifestPath: string;
    outputManifestPath: string;
}

const RawBlazorManifestInfoSchema = z.object({
    Properties: z.object({
        MSBuildProjectDirectory: z.string().nonempty(vscode.l10n.t('MSBuildProjectDirectory must have a value')),
        StaticWebAssetDevelopmentManifestPath: z.string().nonempty(vscode.l10n.t('StaticWebAssetDevelopmentManifestPath must have a value')),
        OutputPath: z.string().nonempty(vscode.l10n.t('OutputPath must have a value')),
        TargetName: z.string().nonempty(vscode.l10n.t('TargetName must have a value')),
    })
});

export async function getNetCoreProjectInfo(project: string, additionalProperties?: CommandLineArgs): Promise<NetCoreProjectInfo> {
    const args = composeArgs(
        withArg('build', '--no-restore'),
        withArg('-target:ComputeContainerConfig'),
        withArg('-getProperty:AssemblyName,TargetFramework,TargetFrameworks,OutputPath,EnableSdkContainerSupport,ContainerWorkingDirectory,ContainerRepository,ContainerImageName'),
        withArg(...(additionalProperties ?? [])),
        withQuotedArg(project),
    )();

    try {
        const { stdout } = await execAsync('dotnet', args, { timeout: 20000 });
        const rawInfo = RawNetCoreProjectInfoSchema.parse(JSON.parse(stdout));

        const assemblyName = `${rawInfo.Properties.AssemblyName}.dll`;
        const targetFrameworks = rawInfo.Properties.TargetFrameworks ?
            rawInfo.Properties.TargetFrameworks.split(';') : [rawInfo.Properties.TargetFramework!]; // eslint-disable-line @typescript-eslint/no-non-null-assertion
        const enableSdkContainerSupport = !!rawInfo.Properties.EnableSdkContainerSupport;

        return {
            assemblyName: assemblyName,
            targetFrameworks: targetFrameworks,
            assemblyRelativeOutputPath: path.join(rawInfo.Properties.OutputPath, assemblyName),
            enableSdkContainerSupport: enableSdkContainerSupport,
            assemblyContainerPath:
                enableSdkContainerSupport ?
                    path.posix.join(rawInfo.Properties.ContainerWorkingDirectory!, assemblyName) : // eslint-disable-line @typescript-eslint/no-non-null-assertion
                    undefined,
            imageName:
                enableSdkContainerSupport ?
                    rawInfo.Properties.ContainerRepository || rawInfo.Properties.ContainerImageName :
                    undefined,
        };
    } catch (err) {
        const error = parseError(err);
        throw new Error(vscode.l10n.t('Unable to determine project information for project \'{0}\': {1}', project, error.message));
    }
}

export async function getBlazorManifestInfo(project: string): Promise<BlazorManifestInfo> {
    const args = composeArgs(
        withArg('build', '--no-restore'),
        withArg('-target:ResolveStaticWebAssetsConfiguration'),
        withArg('-getProperty:MSBuildProjectDirectory,StaticWebAssetDevelopmentManifestPath,OutputPath,TargetName'),
        withQuotedArg(project),
    )();

    try {
        const { stdout } = await execAsync('dotnet', args, { timeout: 20000 });
        const rawInfo = RawBlazorManifestInfoSchema.parse(JSON.parse(stdout));

        return {
            inputManifestPath: path.join(rawInfo.Properties.MSBuildProjectDirectory, rawInfo.Properties.StaticWebAssetDevelopmentManifestPath),
            outputManifestPath: path.join(rawInfo.Properties.MSBuildProjectDirectory, rawInfo.Properties.OutputPath, `${rawInfo.Properties.TargetName}.staticwebassets.runtime.json`),
        };
    } catch (err) {
        const error = parseError(err);
        throw new Error(vscode.l10n.t('Unable to determine Blazor project information for project \'{0}\': {1}', project, error.message));
    }
}
