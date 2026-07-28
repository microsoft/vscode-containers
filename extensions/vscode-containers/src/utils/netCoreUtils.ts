/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseError } from '@microsoft/vscode-azext-utils';
import { CommandLineArgs, composeArgs, withArg, withFlagArg, withQuotedArg } from '@microsoft/vscode-processutils';
import * as path from 'path';
import * as vscode from 'vscode';
import * as z from 'zod/mini';
import { CS_GLOB_PATTERN, CSPROJ_GLOB_PATTERN, FSPROJ_GLOB_PATTERN } from '../constants';
import { execAsync } from './execAsync';
import { resolveFilesOfPattern } from './quickPickFile';

/**
 * Determines whether the given .NET "project" is actually a file-based app: a single C# file
 * (e.g. `app.cs`) that can be run directly with `dotnet run app.cs` without a `.csproj`.
 * {@link https://devblogs.microsoft.com/dotnet/announcing-dotnet-run-app/}
 */
export function isFileBasedApp(project: string | undefined): boolean {
    return !!project && path.extname(project).toLowerCase() === '.cs';
}

/**
 * Determines whether the folder is a file-based .NET app: it contains a single-file app (.cs) and no
 * project file (.csproj/.fsproj), meaning the .NET SDK is the only way to build a container image for it.
 */
export async function isFileBasedAppFolder(folder: vscode.WorkspaceFolder): Promise<boolean> {
    const projectFiles = await resolveFilesOfPattern(folder, [CSPROJ_GLOB_PATTERN, FSPROJ_GLOB_PATTERN]);
    if (projectFiles?.length) {
        return false;
    }

    const fileBasedApps = await resolveFilesOfPattern(folder, [CS_GLOB_PATTERN]);
    return !!(fileBasedApps?.length);
}

interface NetCoreCommonProjectInfo {
    assemblyName: string;
    targetFrameworks: string[];
    assemblyRelativeOutputPath: string;
}

interface NetCoreContainerProjectInfo {
    enableSdkContainerSupport: true;
    assemblyContainerPath: string;
    imageName: string;
}

interface NetCoreNonContainerProjectInfo {
    enableSdkContainerSupport: false;
    assemblyContainerPath: never;
    imageName: never;
}

export type NetCoreProjectInfo = NetCoreCommonProjectInfo & (NetCoreContainerProjectInfo | NetCoreNonContainerProjectInfo);

const RawNetCoreProjectInfoSchema = z.object({
    Properties: z
        .object({
            AssemblyName: z.string().check(z.minLength(1, vscode.l10n.t('AssemblyName must have a value'))),
            OutputPath: z.string().check(z.minLength(1, vscode.l10n.t('OutputPath must have a value'))),
            TargetFramework: z.optional(z.string()),
            TargetFrameworks: z.optional(z.string()),
            EnableSdkContainerSupport: z.optional(z.stringbool()),
            ContainerWorkingDirectory: z.optional(z.string()),
            ContainerRepository: z.optional(z.string()),
        })
        .check(
            z.refine(info => info.TargetFramework || info.TargetFrameworks, vscode.l10n.t('Either TargetFramework or TargetFrameworks must have a value')),
            z.refine(info => !info.EnableSdkContainerSupport || (info.ContainerWorkingDirectory && info.ContainerRepository), vscode.l10n.t('ContainerWorkingDirectory and ContainerRepository must have values when EnableSdkContainerSupport is true')),
        ),
});

export async function getNetCoreProjectInfo(project: string, additionalProperties?: CommandLineArgs): Promise<NetCoreProjectInfo> {
    const args = composeArgs(
        withArg('build'),
        // File-based apps (single .cs file) have no prior restore, so we must allow the implicit restore.
        withFlagArg('--no-restore', !isFileBasedApp(project)),
        withArg('-target:ComputeContainerConfig'),
        withArg('-getProperty:AssemblyName,TargetFramework,TargetFrameworks,OutputPath,EnableSdkContainerSupport,ContainerWorkingDirectory,ContainerRepository'),
        withArg(...(additionalProperties ?? [])),
        withQuotedArg(project),
    )();

    try {
        const { stdout } = await execAsync('dotnet', args, { timeout: 20000 });
        const rawInfo = RawNetCoreProjectInfoSchema.parse(JSON.parse(stdout));

        const assemblyName = `${rawInfo.Properties.AssemblyName}.dll`;
        const targetFrameworks = rawInfo.Properties.TargetFrameworks ?
            rawInfo.Properties.TargetFrameworks.split(';') : [rawInfo.Properties.TargetFramework!]; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- we know it must be one of the two due to the schema refinement

        const commonInfo = {
            assemblyName: assemblyName,
            targetFrameworks: targetFrameworks,
            assemblyRelativeOutputPath: path.join(rawInfo.Properties.OutputPath, assemblyName),
        };

        if (rawInfo.Properties.EnableSdkContainerSupport) {
            return {
                ...commonInfo,
                enableSdkContainerSupport: true,
                assemblyContainerPath: path.posix.join(rawInfo.Properties.ContainerWorkingDirectory!, assemblyName), // eslint-disable-line @typescript-eslint/no-non-null-assertion -- we know this is set if EnableSdkContainerSupport is true due to the schema refinement
                imageName: rawInfo.Properties.ContainerRepository!,  // eslint-disable-line @typescript-eslint/no-non-null-assertion -- we know this is set if EnableSdkContainerSupport is true due to the schema refinement
            };
        } else {
            return {
                ...commonInfo,
                enableSdkContainerSupport: false,
                assemblyContainerPath: undefined as never,
                imageName: undefined as never,
            };
        }
    } catch (err) {
        const error = parseError(err);
        throw new Error(vscode.l10n.t('Unable to determine project information for project \'{0}\': {1}', project, error.message), { cause: err });
    }
}

export interface BlazorManifestInfo {
    inputManifestPath: string;
    outputManifestPath: string;
}

const RawBlazorManifestInfoSchema = z.object({
    Properties: z.object({
        MSBuildProjectDirectory: z.string().check(z.minLength(1, vscode.l10n.t('MSBuildProjectDirectory must have a value'))),
        StaticWebAssetDevelopmentManifestPath: z.string().check(z.minLength(1, vscode.l10n.t('StaticWebAssetDevelopmentManifestPath must have a value'))),
        OutputPath: z.string().check(z.minLength(1, vscode.l10n.t('OutputPath must have a value'))),
        TargetName: z.string().check(z.minLength(1, vscode.l10n.t('TargetName must have a value'))),
    })
});

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
        throw new Error(vscode.l10n.t('Unable to determine Blazor project information for project \'{0}\': {1}', project, error.message), { cause: err });
    }
}
