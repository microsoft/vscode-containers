/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandLineArgs, composeArgs, withArg, withNamedArg, withQuotedArg } from '@microsoft/vscode-processutils';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { l10n } from 'vscode';
import { ext } from '../../extensionVariables';
import { execAsync } from '../../utils/execAsync';
import { streamToFile } from '../../utils/httpRequest';
import { isWindows } from '../../utils/osUtils';

type VsDbgVersion = 'latest'; // There are other versions but we don't use them
type VsDbgRuntime = 'linux-x64' | 'linux-musl-x64' | 'linux-arm64' | 'linux-musl-arm64' | 'win7-x64';

const scriptAcquiredDateKey = 'vscode-containers.vsdbgHelper.scriptAcquiredDate';
const scriptExecutedDateKeyPrefix = 'vscode-containers.vsdbgHelper.scriptExecutedDate';
const dayInMs = 24 * 60 * 60 * 1000;

export const vsDbgInstallBasePath = path.join(os.homedir(), '.vsdbg');

const acquisition: { url: string, scriptPath: string, getShellCommands(runtime: VsDbgRuntime, version: VsDbgVersion): { command: string, args: CommandLineArgs }[]; } =
    isWindows() ?
        {
            url: 'https://aka.ms/getvsdbgps1',
            scriptPath: path.join(vsDbgInstallBasePath, 'GetVsDbg.ps1'),
            getShellCommands: (runtime: VsDbgRuntime, version: VsDbgVersion) => {
                const args = composeArgs(
                    withArg('-NonInteractive', '-NoProfile'),
                    withNamedArg('-WindowStyle', 'Hidden'),
                    withNamedArg('-ExecutionPolicy', 'RemoteSigned'),
                    withNamedArg('-File', acquisition.scriptPath, { shouldQuote: true }),
                    withNamedArg('-Version', version),
                    withNamedArg('-RuntimeID', runtime),
                    withNamedArg('-InstallPath', getInstallDirectory(runtime, version), { shouldQuote: true }),
                )();
                return [{
                    command: 'powershell',
                    args: args,
                }];
            }
        } :
        {
            url: 'https://aka.ms/getvsdbgsh',
            scriptPath: path.join(vsDbgInstallBasePath, 'getvsdbg.sh'),
            getShellCommands: (runtime: VsDbgRuntime, version: VsDbgVersion) => {
                const chmodArgs = composeArgs(
                    withArg('+x'),
                    withQuotedArg(acquisition.scriptPath)
                )();

                const scriptArgs = composeArgs(
                    withArg('-u'),
                    withNamedArg('-v', version),
                    withNamedArg('-r', runtime),
                    withNamedArg('-l', getInstallDirectory(runtime, version), { shouldQuote: true })
                )();

                return [
                    {
                        command: 'chmod',
                        args: chmodArgs
                    },
                    {
                        command: acquisition.scriptPath, // This doesn't need to be quoted, `spawnStreamAsync` does it internally
                        args: scriptArgs,
                    },
                ];
            }
        };

function getInstallDirectory(runtime: VsDbgRuntime, version: VsDbgVersion): string {
    return path.join(vsDbgInstallBasePath, runtime, version);
}

export interface VsDbgType {
    runtime: VsDbgRuntime,
    version: VsDbgVersion
}

export async function installDebuggersIfNecessary(debuggers: VsDbgType[]): Promise<void> {
    if (!(await fse.pathExists(vsDbgInstallBasePath))) {
        await fse.mkdir(vsDbgInstallBasePath);
    }

    const newScript = await getLatestAcquisitionScriptIfNecessary();

    await Promise.all(debuggers.map(d => executeAcquisitionScriptIfNecessary(d.runtime, d.version, newScript)));
}

async function getLatestAcquisitionScriptIfNecessary(): Promise<boolean> {
    const lastAcquired = ext.context.globalState.get<number | undefined>(scriptAcquiredDateKey, undefined);

    if (lastAcquired && Date.now() - lastAcquired < dayInMs && await fse.pathExists(acquisition.scriptPath)) {
        // Acquired recently, no need to reacquire
        return false;
    }

    ext.outputChannel.info(l10n.t('Acquiring latest VsDbg install script...'));
    await streamToFile(acquisition.url, acquisition.scriptPath);

    await ext.context.globalState.update(scriptAcquiredDateKey, Date.now());
    ext.outputChannel.info(l10n.t('Script acquired.'));
    return true;
}

async function executeAcquisitionScriptIfNecessary(runtime: VsDbgRuntime, version: VsDbgVersion, newScript: boolean): Promise<void> {
    const scriptExecutedDateKey = `${scriptExecutedDateKeyPrefix}.${runtime}.${version}`;

    const lastExecuted = ext.context.globalState.get<number | undefined>(scriptExecutedDateKey, undefined);

    if (!newScript && lastExecuted && Date.now() - lastExecuted < dayInMs && await fse.pathExists(getInstallDirectory(runtime, version))) {
        // Executed recently, no need to reexecute
        return;
    }

    ext.outputChannel.info(l10n.t('Installing VsDbg, Runtime = {0}, Version = {1}...', runtime, version));

    const commands = acquisition.getShellCommands(runtime, version);

    for (const { command, args } of commands) {
        await execAsync(command, args, {
            onCommand: (commandLine: string) => ext.outputChannel.info(commandLine),
        }, (output: string, err: boolean) => {
            if (err) {
                ext.outputChannel.error(output);
            } else {
                ext.outputChannel.info(output);
            }
        });
    }

    await ext.context.globalState.update(scriptExecutedDateKey, Date.now());
    ext.outputChannel.info(l10n.t('VsDbg installed, Runtime = {0}, Version = {1}...', runtime, version));
}
