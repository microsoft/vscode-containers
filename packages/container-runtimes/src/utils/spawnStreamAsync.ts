/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, SpawnOptions } from 'child_process';
import * as stream from 'stream';
import { ShellQuoting } from 'vscode';

import { CancellationTokenLike } from '../typings/CancellationTokenLike';
import { CancellationError } from './CancellationError';
import { ChildProcessError } from './ChildProcessError';
import { CommandLineArgs } from './commandLineBuilder';

export type StreamSpawnOptions = SpawnOptions & {
    onCommand?: (command: string) => void;
    cancellationToken?: CancellationTokenLike;

    stdInPipe?: stream.Readable;
    stdOutPipe?: stream.Writable;
    stdErrPipe?: stream.Writable;
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

export async function spawnStreamAsync(command: string, args: Array<string>, options: StreamSpawnOptions): Promise<void> {
    const cancellationToken = options.cancellationToken || CancellationTokenLike.None;

    if (cancellationToken.isCancellationRequested) {
        throw new CancellationError('Command cancelled', cancellationToken);
    }

    if (options.onCommand) {
        options.onCommand([command, ...args].join(' '));
    }

    const childProcess = spawn(command, args, { shell: options.shell });

    if (options.stdInPipe) {
        options.stdInPipe.pipe(childProcess.stdin);
    }

    if (options.stdOutPipe) {
        childProcess.stdout.pipe(options.stdOutPipe);
    }

    if (options.stdErrPipe) {
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
