/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandResponseLike, CommandRunner, normalizeCommandResponseLike } from '../contracts/CommandRunner';
import { bashQuote, spawnAsync } from '../utils/spawnAsync';
import { ShellCommandRunnerOptions } from './shell';

export type WslShellCommandRunnerOptions = ShellCommandRunnerOptions & {
    wslPath?: string;
    distro?: string | null;
};

export const wslCommandRunnerAsync: CommandRunner<WslShellCommandRunnerOptions> = async <T>(commandResponseLike: CommandResponseLike<T>, options: WslShellCommandRunnerOptions): Promise<T> => {
    const commandResponse = await normalizeCommandResponseLike(commandResponseLike);
    const command = options.wslPath ?? 'wsl.exe';
    const args = [...(options.distro ? ['-d', options.distro] : []), '--', commandResponse.command, ...bashQuote(commandResponse.args)];
    return await commandResponse.parse(await spawnAsync(command, args, { ...options, shell: true }), options.strict || false);
};
