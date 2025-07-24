/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccumulatorStream, CommandLineArgs, Shell, spawnStreamAsync, StreamSpawnOptions } from '@microsoft/vscode-processutils';
import * as stream from 'stream';

type Progress = (content: string, err: boolean) => void;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type ExecError = Error & { code: any, signal: any, stdErrHandled: boolean };

export type ExecAsyncOutput = { stdout: string, stderr: string };

export async function execAsync(command: string, args: CommandLineArgs, options?: Partial<StreamSpawnOptions>, progress?: Progress): Promise<ExecAsyncOutput> {
    const stdoutFinal = new AccumulatorStream();
    const stderrFinal = new AccumulatorStream();

    let stdoutIntermediate: stream.PassThrough | undefined;
    let stderrIntermediate: stream.PassThrough | undefined;
    if (progress) {
        stdoutIntermediate = new stream.PassThrough();
        stdoutIntermediate.on('data', (chunk: Buffer) => {
            try {
                progress(bufferToString(chunk), false);
            } catch {
                // Best effort
            }
        });
        stdoutIntermediate.pipe(stdoutFinal);

        stderrIntermediate = new stream.PassThrough();
        stderrIntermediate.on('data', (chunk: Buffer) => {
            try {
                progress(bufferToString(chunk), true);
            } catch {
                // Best effort
            }
        });
        stderrIntermediate.pipe(stderrFinal);
    }

    const spawnOptions: StreamSpawnOptions = {
        ...options,
        shellProvider: Shell.getShellOrDefault(),
        stdOutPipe: stdoutIntermediate ?? stdoutFinal,
        stdErrPipe: stderrIntermediate ?? stderrFinal,
    };

    await spawnStreamAsync(command, args, spawnOptions);

    return {
        stdout: await stdoutFinal.getString(),
        stderr: await stderrFinal.getString(),
    };
}

export function bufferToString(buffer: Buffer): string {
    // Remove non-printing control characters and trailing newlines
    // eslint-disable-next-line no-control-regex
    return buffer.toString().replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F]|\r?\n$/g, '');
}
