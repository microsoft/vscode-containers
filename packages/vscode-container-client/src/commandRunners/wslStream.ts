/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    CommandLineArgs,
    composeArgs,
    withArg,
    withNamedArg
} from '@microsoft/vscode-processutils';
import {
    CommandResponseBase,
    ICommandRunnerFactory,
} from '../contracts/CommandRunner';
import {
    ShellStreamCommandRunnerFactory,
    ShellStreamCommandRunnerOptions,
} from './shellStream';

export type WslShellCommandRunnerOptions = ShellStreamCommandRunnerOptions & {
    wslPath?: string;
    distro?: string | null;
};

/**
 * Special case of {@link ShellStreamCommandRunnerFactory} for executing commands in a wsl distro
 */
export class WslShellCommandRunnerFactory extends ShellStreamCommandRunnerFactory<WslShellCommandRunnerOptions> implements ICommandRunnerFactory {
    protected getCommandAndArgs(commandResponse: CommandResponseBase): { command: string, args: CommandLineArgs } {
        const command = this.options.wslPath ?? 'wsl.exe';
        const args = composeArgs(
            withNamedArg('-d', this.options.distro),
            withArg('--'),
            withArg(commandResponse.command),
            withArg(...commandResponse.args),
        )();

        return { command, args };
    }
}
