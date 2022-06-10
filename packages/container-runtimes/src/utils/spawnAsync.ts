/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, SpawnOptions } from 'child_process';
import { ShellQuoting } from 'vscode';

import { CancellationTokenLike } from '../typings/CancellationTokenLike';
import { CancellationError } from './CancellationError';
import { ChildProcessError } from './ChildProcessError';
import { CommandLineArgs } from './commandLineBuilder';

export type ExtendedSpawnOptions = SpawnOptions & {
    shell?: boolean;
    onCommand?: (command: string) => void;
    onStdOut?: (data: string | Buffer) => void;
    onStdErr?: (data: string | Buffer) => void;
    cancellationToken?: CancellationTokenLike;
};

const isQuoted = (value: string): boolean => {
    if (value.length >= 2 && (value[0] === "'" || value[0] === '"') && value[value.length - 1] === value[0]) {
        return true;
    }

    return false;
};

export const powershellQuote = (args: CommandLineArgs): Array<string> => {
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
    });
};

export const bashQuote = (args: CommandLineArgs): Array<string> => {
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

export async function spawnAsync(command: string, args: Array<string>, options: ExtendedSpawnOptions): Promise<string> {
    const cancellationToken = options.cancellationToken || CancellationTokenLike.None;

    if (cancellationToken.isCancellationRequested) {
        throw new CancellationError('Command cancelled', cancellationToken);
    }

    if (options.onCommand) {
        options.onCommand([command, ...args].join(' '));
    }

    const childProcess = spawn(command, args, { shell: options.shell });

    return new Promise<string>((resolve, reject) => {
        let output: string = '';
        let error: string = '';

        const disposable = cancellationToken.onCancellationRequested(() => {
            childProcess.removeAllListeners();
            childProcess.kill();
            reject(new CancellationError('Command cancelled', cancellationToken));
        });

        // Accumulate and report on stdout
        childProcess.stdout.on('data', (chunk) => {
            const data = chunk.toString();
            output += data;

            if (options.onStdOut) {
                options.onStdOut(data);
            }
        });

        // Accumulate and report on stderr
        childProcess.stderr.on('data', (chunk) => {
            const data = chunk.toString();
            if (data.includes('screen size is bogus')) {
                return;
            }

            error += data;

            if (options.onStdErr) {
                options.onStdErr(data);
            }
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
                resolve(output);
            } else {
                reject(new ChildProcessError(error, code, signal));
            }
        });
    });
}
