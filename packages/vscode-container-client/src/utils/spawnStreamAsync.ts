/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, SpawnOptions } from 'child_process';
import * as treeKill from 'tree-kill';

import { CancellationTokenLike } from '../typings/CancellationTokenLike';
import { CancellationError } from './CancellationError';
import { ChildProcessError } from './ChildProcessError';
import { CommandLineArgs } from './commandLineBuilder';
import { getSafeExecPath } from './getSafeExecPath';
import { Shell } from './Shell';

/**
 * Options for spawning a process with pipe streaming capabilities.
 * This extends the standard {@link SpawnOptions} to include additional features
 * such as command logging, cancellation support, and shell customization.
 */
export type StreamSpawnOptions = SpawnOptions & {
    /**
     * A callback that is invoked with the full command line that is being executed.
     * This is useful for logging or debugging purposes.
     */
    onCommand?: (command: string) => void;

    /**
     * A cancellation token that can be used to cancel the command execution.
     * If the token is cancelled, the command will be terminated and the promise will be rejected
     */
    cancellationToken?: CancellationTokenLike;

    /**
     * A shell provider that can be used to customize the shell used for command execution.
     * This needs to be used in conjunction with {@link SpawnOptions.shell}.
     */
    shellProvider?: Shell;

    /**
     * Whether to allow the use of unsafe executable paths. If true, the command executed
     * could be executed from the current working directory instead of the PATH, which may not be safe.
     */
    allowUnsafeExecutablePath?: boolean;

    /**
     * A stream to pipe standard input to the spawned process.
     */
    stdInPipe?: NodeJS.ReadableStream;

    /**
     * A stream to pipe standard output from the spawned process.
     */
    stdOutPipe?: NodeJS.WritableStream;

    /**
     * A stream to pipe standard error from the spawned process.
     */
    stdErrPipe?: NodeJS.WritableStream;
};

/**
 * Spawns a command in a child process, allowing for streaming input and output.
 * @param command The command to execute. Full command lines are supported, but not recommended for security reasons.
 * If a full command line is provided, you will also need to use the {@link StreamSpawnOptions.allowUnsafeExecutablePath} option.
 * @param args The arguments to pass to the command. If a {@link Shell} is provided, it will apply quoting rules.
 * @param options The options for spawning the command
 * @returns A promise that resolves when the command has completed
 */
export async function spawnStreamAsync(
    command: string,
    args: CommandLineArgs,
    options: StreamSpawnOptions,
): Promise<void> {
    const cancellationToken = options.cancellationToken || CancellationTokenLike.None;
    const shell = options.shellProvider?.getShellOrDefault(options.shell) ?? options.shell;

    // If there is a shell provider, apply its quoting, otherwise just flatten arguments into strings
    const normalizedArgs: string[] = options.shellProvider?.quote(args) ?? args.map(arg => typeof arg === 'string' ? arg : arg.value);

    if (cancellationToken.isCancellationRequested) {
        throw new CancellationError('Command cancelled', cancellationToken);
    }

    const safeCommand = !!options.allowUnsafeExecutablePath ? command : getSafeExecPath(command);

    if (options.onCommand) {
        options.onCommand([safeCommand, ...normalizedArgs].join(' '));
    }

    const childProcess = spawn(
        safeCommand,
        normalizedArgs,
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
            disposable.dispose();
            options.stdOutPipe?.end();
            options.stdErrPipe?.end();
            childProcess.removeAllListeners();

            if (childProcess.pid) {
                treeKill(childProcess.pid);
            }

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
            } else if (signal) {
                reject(new ChildProcessError(`Process exited due to signal ${signal}`, code, signal));
            } else {
                reject(new ChildProcessError(`Process exited with code ${code}`, code, signal));
            }
        });
    });
}
