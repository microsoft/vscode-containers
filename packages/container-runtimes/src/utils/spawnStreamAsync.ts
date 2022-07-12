/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, SpawnOptions } from 'child_process';
import * as os from 'os';
import { ShellQuoting } from 'vscode';

import { CancellationTokenLike } from '../typings/CancellationTokenLike';
import { CancellationError } from './CancellationError';
import { ChildProcessError } from './ChildProcessError';
import { CommandLineArgs } from './commandLineBuilder';

/**
 * A {@link ShellQuote} method applies quoting rules for a specific shell.
 * Quoth the cmd.exe 'nevermore'.
 */
export type ShellQuote = (args: CommandLineArgs) => Array<string>;

export type StreamSpawnOptions = SpawnOptions & {
    onCommand?: (command: string) => void;
    cancellationToken?: CancellationTokenLike;

    stdInPipe?: NodeJS.ReadableStream;
    stdOutPipe?: NodeJS.WritableStream;
    stdErrPipe?: NodeJS.WritableStream;
};

const isQuoted = (value: string): boolean => {
    if (value.length >= 2 && (value[0] === "'" || value[0] === '"') && value[value.length - 1] === value[0]) {
        return true;
    }

    return false;
};

/**
 * Applies quoting rules for PowerShell to {@link CommandLineArgs} arguments
 * @param args An array of {@link ShellQuotedString} with associated quoting rules
 * @returns An array of string arguments quoted for PowerShell
 */
export const powershellQuote: ShellQuote = (args: CommandLineArgs): Array<string> => {
    return args.map((quotedArg) => {
        if (isQuoted(quotedArg.value)) {
            return quotedArg.value;
        }

        switch (quotedArg.quoting) {
            case ShellQuoting.Escape:
                return quotedArg.value.replace(/[ "'()]/g, (match) => `\`${match}`);
            case ShellQuoting.Weak:
                return `"${quotedArg.value}"`;
            case ShellQuoting.Strong:
                return `'${quotedArg.value}'`;
        }
    }).map((quotedArg) => {
        // Additionally, for PowerShell only, escape double quotes that are not
        // the first or last character in the arg
        return quotedArg.replace(/(?<!^)"(?!$)/g, (match) => `\\${match}`);
    });
};

/**
 * Applies quoting rules for bash/zsh to {@link CommandLineArgs} arguments
 * @param args An array of {@link ShellQuotedString} with associated quoting rules
 * @returns An array of string arguments quoted for bash/zsh
 */
export const bashQuote: ShellQuote = (args: CommandLineArgs): Array<string> => {
    return args.map((quotedArg) => {
        if (isQuoted(quotedArg.value)) {
            return quotedArg.value;
        }

        switch (quotedArg.quoting) {
            case ShellQuoting.Escape:
                return quotedArg.value.replace(/[ "']/g, (match) => `\\${match}`);
            case ShellQuoting.Weak:
                return `"${quotedArg.value}"`;
            case ShellQuoting.Strong:
                return `'${quotedArg.value}'`;
        }
    });
};

export async function spawnStreamAsync(
    command: string,
    args: Array<string>,
    options: StreamSpawnOptions,
): Promise<void> {
    const cancellationToken = options.cancellationToken || CancellationTokenLike.None;
    // Force PowerShell as the default on Windows, but use the system default on
    // *nix
    const shell = typeof options.shell !== 'string' && options.shell !== false && os.platform() === 'win32'
        ? 'powershell.exe'
        : options.shell;

    if (cancellationToken.isCancellationRequested) {
        throw new CancellationError('Command cancelled', cancellationToken);
    }

    if (options.onCommand) {
        options.onCommand([command, ...args].join(' '));
    }

    const childProcess = spawn(
        command,
        args,
        {
            ...options,
            shell,
            // Ignore stdio streams if not needed to avoid backpressure issues
            stdio: [
                options.stdInPipe ? 'pipe' : 'ignore',
                options.stdOutPipe ? 'pipe' : 'ignore',
                options.stdErrPipe ? 'pipe' : 'ignore',
            ],
        },
    );

    if (options.stdInPipe && childProcess.stdin) {
        options.stdInPipe.pipe(childProcess.stdin);
    }

    if (options.stdOutPipe && childProcess.stdout) {
        childProcess.stdout.pipe(options.stdOutPipe);
    }

    if (options.stdErrPipe && childProcess.stderr) {
        childProcess.stderr.pipe(options.stdErrPipe);
    }

    return new Promise<void>((resolve, reject) => {
        const disposable = cancellationToken.onCancellationRequested(() => {
            childProcess.removeAllListeners();
            childProcess.kill();
            reject(new CancellationError('Command cancelled', cancellationToken));
        });

        // Reject the promise on an error event
        childProcess.on('error', (err) => {
            disposable.dispose();
            reject(err);
        });

        // Complete the promise when the process exits
        childProcess.on('exit', (code, signal) => {
            disposable.dispose();
            if (code === 0) {
                resolve();
            } else {
                reject(new ChildProcessError(`Process exited with code ${code}`, code, signal));
            }
        });
    });
}
