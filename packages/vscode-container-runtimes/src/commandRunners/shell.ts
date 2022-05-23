/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vscode-jsonrpc';

import { CommandResponse } from '../contracts/ContainerClient';
import { powershellQuote, spawnAsync } from '../utils/spawnAsync';

export type ShellCommandRunnerOptions = {
    strict?: boolean;
    onCommand?: (command: string) => void;
    onStdOut?: (data: string | Buffer) => void;
    onStdErr?: (data: string | Buffer) => void;
    cancellationToken?: CancellationToken;
};

export const shellCommandRunnerAsync = async <T>(commandResponse: CommandResponse<T>, options: ShellCommandRunnerOptions): Promise<T> => {
    return await commandResponse.parse(await spawnAsync(commandResponse.command, powershellQuote(commandResponse.args), { ...options, shell: true }), options.strict || false);
};
