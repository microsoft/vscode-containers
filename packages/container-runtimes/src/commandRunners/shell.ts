/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    CommandResponseLike,
    CommandRunner,
    ICommandRunnerFactory,
    normalizeCommandResponseLike,
} from '../contracts/CommandRunner';
import { CancellationTokenLike } from '../typings/CancellationTokenLike';
import { powershellQuote, spawnAsync } from '../utils/spawnAsync';

export type ShellCommandRunnerOptions = {
    strict?: boolean;
    onCommand?: (command: string) => void;
    onStdOut?: (data: string | Buffer) => void;
    onStdErr?: (data: string | Buffer) => void;
    cancellationToken?: CancellationTokenLike;
};

export class ShellCommandRunnerFactory implements ICommandRunnerFactory {
    constructor(options: ShellCommandRunnerOptions) {
        this.options = options;
    }

    getCommandRunner(): CommandRunner {
        return async <T>(commandResponseLike: CommandResponseLike<T>) => {
            const commandResponse = await normalizeCommandResponseLike(commandResponseLike);
            return await commandResponse.parse(await spawnAsync(commandResponse.command, powershellQuote(commandResponse.args), { ...this.options, shell: true }), this.options.strict || false);
        };
    }

    protected options: ShellCommandRunnerOptions;
}
