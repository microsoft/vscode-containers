/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandResponseLike, CommandRunner, normalizeCommandResponseLike } from '../contracts/CommandRunner';
import { CancellationTokenLike } from '../typings/CancellationTokenLike';
import { powershellQuote, spawnAsync } from '../utils/spawnAsync';

export type ShellCommandRunnerOptions = {
    strict?: boolean;
    onCommand?: (command: string) => void;
    onStdOut?: (data: string | Buffer) => void;
    onStdErr?: (data: string | Buffer) => void;
    cancellationToken?: CancellationTokenLike;
};

export const shellCommandRunnerAsync: CommandRunner<ShellCommandRunnerOptions> = async <T>(commandResponseLike: CommandResponseLike<T>, options: ShellCommandRunnerOptions): Promise<T> => {
    const commandResponse = await normalizeCommandResponseLike(commandResponseLike);
    return await commandResponse.parse(await spawnAsync(commandResponse.command, powershellQuote(commandResponse.args), { ...options, shell: true }), options.strict || false);
};
