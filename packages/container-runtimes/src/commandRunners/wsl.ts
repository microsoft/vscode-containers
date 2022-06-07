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
import { bashQuote, spawnAsync } from '../utils/spawnAsync';
import { ShellCommandRunnerOptions } from './shell';

export type WslShellCommandRunnerOptions = ShellCommandRunnerOptions & {
    wslPath?: string;
    distro?: string | null;
};

export class WslShellCommandRunnerFactory implements ICommandRunnerFactory {
    constructor(options: WslShellCommandRunnerOptions) {
        this.options = options;
    }

    getCommandRunner(): CommandRunner {
        return async <T>(commandResponseLike: CommandResponseLike<T>): Promise<T> => {
            const commandResponse = await normalizeCommandResponseLike(commandResponseLike);
            const command = this.options.wslPath ?? 'wsl.exe';
            const args = [...(this.options.distro ? ['-d', this.options.distro] : []), '--', commandResponse.command, ...bashQuote(commandResponse.args)];
            return await commandResponse.parse(await spawnAsync(command, args, { ...this.options, shell: true }), this.options.strict || false);
        };
    }

    protected options: WslShellCommandRunnerOptions;
}
