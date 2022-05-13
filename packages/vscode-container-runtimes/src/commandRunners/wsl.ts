/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vscode-jsonrpc';

import { CommandResponse } from '../contracts/ContainerClient';
import { bashQuote, spawnAsync } from '../utils/spawnAsync';

export type WslShellCommandRunnerOptions = {
    strict?: boolean;
    wslPath?: string;
    distro?: string | null;
    onCommand?: (command: string) => void;
    onStdOut?: (data: string | Buffer) => void;
    onStdErr?: (data: string | Buffer) => void;
    cancellationToken?: CancellationToken;
};

export const wslCommandRunnerAsync = async <T>(commandResponse: CommandResponse<T>, options: WslShellCommandRunnerOptions): Promise<T> => {
    const command = options.wslPath ?? 'wsl.exe';
    const args = [...(options.distro ? ['-d', options.distro] : []), '--', commandResponse.command, ...bashQuote(commandResponse.args)];
    return await commandResponse.parse(await spawnAsync(command, args, { ...options, shell: true }), options.strict || false);
};
