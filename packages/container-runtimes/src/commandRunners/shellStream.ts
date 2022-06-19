/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    CommandResponseLike,
    ICommandRunnerFactory,
    normalizeCommandResponseLike,
    VoidCommandRunner,
} from '../contracts/CommandRunner';
import { powershellQuote, spawnStreamAsync, StreamSpawnOptions } from '../utils/spawnAsync';

export type ShellStreamCommandRunnerOptions = StreamSpawnOptions;

export class ShellStreamCommandRunnerFactory implements ICommandRunnerFactory {
    public constructor(options: ShellStreamCommandRunnerOptions) {
        this.options = options;
    }

    public getCommandRunner(): VoidCommandRunner {
        return async (commandResponseLike: CommandResponseLike<unknown>) => {
            const commandResponse = await normalizeCommandResponseLike(commandResponseLike);
            await spawnStreamAsync(commandResponse.command, powershellQuote(commandResponse.args), { ...this.options, shell: true });
        };
    }

    protected options: ShellStreamCommandRunnerOptions;
}
