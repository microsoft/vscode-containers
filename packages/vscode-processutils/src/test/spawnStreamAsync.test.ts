/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import * as stream from 'stream';
import { AccumulatorStream } from '../utils/AccumulatorStream';
import { CancellationError } from '../utils/CancellationError';
import { isChildProcessError } from '../utils/ChildProcessError';
import { composeArgs, withArg, withNamedArg } from '../utils/commandLineBuilder';
import { NoShell, Shell } from '../utils/Shell';
import { spawnStreamAsync } from '../utils/spawnStreamAsync';
import { CancellationTokenLike } from '../typings/CancellationTokenLike';

// NOTE: This integration test requires Docker to be installed and running
// It will automatically pull the `alpine:latest` image if not already present

// The command lists Docker images using some relatively complex arguments (at
// least in terms of quoting and escaping)
const command = 'docker';
const args = composeArgs(
    withArg('image', 'ls'),
    withNamedArg('--filter', 'dangling=false', { shouldQuote: true }),
    withArg('--no-trunc'),
    withNamedArg('--format', '{{json .}}', { shouldQuote: true }),
)();

describe('(integration) spawnStreamAsync', () => {
    before(async () => {
        const args = composeArgs(
            withArg('pull', 'alpine:latest'),
        )();

        await spawnStreamAsync(command, args, {
            shellProvider: new NoShell(),
        });
    });

    it('Should be able to run complex commands without a shell', async () => {
        const outAccumulator = new AccumulatorStream();
        const errAccumulator = new AccumulatorStream();

        await spawnStreamAsync(command, args, {
            stdOutPipe: outAccumulator,
            stdErrPipe: errAccumulator,
            shellProvider: new NoShell(),
        });

        const output = await outAccumulator.getString();
        expect(output).to.not.be.empty;
        expect(output).to.include('"Repository":"alpine"');
        expect(output).to.include('"Tag":"latest"');

        expect(await errAccumulator.getString()).to.be.empty;
    });

    it('Should be able to run complex commands with the default shell', async () => {
        const outAccumulator = new AccumulatorStream();
        const errAccumulator = new AccumulatorStream();

        await spawnStreamAsync(command, args, {
            stdOutPipe: outAccumulator,
            stdErrPipe: errAccumulator,
            shellProvider: Shell.getShellOrDefault(),
        });

        const output = await outAccumulator.getString();
        expect(output).to.not.be.empty;
        expect(output).to.include('"Repository":"alpine"');
        expect(output).to.include('"Tag":"latest"');

        expect(await errAccumulator.getString()).to.be.empty;
    });

    it('Should be able to run command lines with special options', async () => {
        const outAccumulator = new AccumulatorStream();
        const errAccumulator = new AccumulatorStream();

        await spawnStreamAsync('docker image ls', [], {
            stdOutPipe: outAccumulator,
            stdErrPipe: errAccumulator,
            shellProvider: Shell.getShellOrDefault(),
            allowUnsafeExecutablePath: true,
        });

        const output = await outAccumulator.getString();
        expect(output).to.not.be.empty;
        expect(output).to.include('alpine');
        expect(output).to.include('latest');

        expect(await errAccumulator.getString()).to.be.empty;
    });
});

/**
 * Races a promise against a timer so that a regression (an accumulator that never settles
 * because its pipe was left open) fails the test deterministically instead of relying on
 * Mocha's global timeout.
 */
async function settlesWithin<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms}ms`)), ms);
    });

    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

describe('(unit) spawnStreamAsync pipe lifecycle', () => {
    // A command that is guaranteed not to exist on PATH, to force a spawn `error` (ENOENT).
    const nonexistentCommand = 'this-executable-should-not-exist-abcdef123456';

    it('Should end provided pipes and settle the accumulator on spawn error (ENOENT)', async () => {
        const outAccumulator = new AccumulatorStream();
        const errAccumulator = new AccumulatorStream();

        // `allowUnsafeExecutablePath` skips PATH resolution so the failure surfaces as a spawn
        // `error` event (ENOENT) rather than a pre-spawn throw.
        let rejected = false;
        try {
            await spawnStreamAsync(nonexistentCommand, [], {
                stdOutPipe: outAccumulator,
                stdErrPipe: errAccumulator,
                allowUnsafeExecutablePath: true,
            });
        } catch {
            rejected = true;
        }

        expect(rejected, 'spawnStreamAsync should reject on ENOENT').to.be.true;

        // The key assertion: awaiting the accumulators must settle, not hang forever.
        expect(await settlesWithin(outAccumulator.getString(), 5000, 'stdOutPipe')).to.equal('');
        expect(await settlesWithin(errAccumulator.getString(), 5000, 'stdErrPipe')).to.equal('');
    });

    it('Should end provided pipes and settle the accumulators on non-zero exit', async () => {
        const outAccumulator = new AccumulatorStream();
        const errAccumulator = new AccumulatorStream();

        let caught: unknown;
        try {
            await spawnStreamAsync(
                process.execPath,
                [
                    '-e',
                    'process.stderr.write("boom"); process.exit(3);',
                ],
                {
                    stdOutPipe: outAccumulator,
                    stdErrPipe: errAccumulator,
                    allowUnsafeExecutablePath: true,
                },
            );
        } catch (err) {
            caught = err;
        }

        expect(isChildProcessError(caught), 'should reject with a ChildProcessError').to.be.true;

        // Both accumulators must settle, and stderr should contain the emitted output.
        expect(await settlesWithin(outAccumulator.getString(), 5000, 'stdOutPipe')).to.equal('');
        expect(await settlesWithin(errAccumulator.getString(), 5000, 'stdErrPipe')).to.equal('boom');
    });

    it('Should end provided pipes and settle the accumulator on pre-spawn cancellation', async () => {
        const outAccumulator = new AccumulatorStream();
        const errAccumulator = new AccumulatorStream();

        const controller = new AbortController();
        controller.abort();
        const cancellationToken = CancellationTokenLike.fromAbortSignal(controller.signal);

        let caught: unknown;
        try {
            await spawnStreamAsync(process.execPath, ['-v'], {
                stdOutPipe: outAccumulator,
                stdErrPipe: errAccumulator,
                allowUnsafeExecutablePath: true,
                cancellationToken,
            });
        } catch (err) {
            caught = err;
        }

        expect(caught, 'should reject with a CancellationError').to.be.instanceOf(CancellationError);

        // Even though no child process ever started, the provided pipes must be ended so the
        // accumulators settle.
        expect(await settlesWithin(outAccumulator.getString(), 5000, 'stdOutPipe')).to.equal('');
        expect(await settlesWithin(errAccumulator.getString(), 5000, 'stdErrPipe')).to.equal('');
    });

    it('Should not truncate output for a slow destination on non-zero exit', async () => {
        // Regression guard: a slower/backpressured destination that is still consuming buffered
        // data when the process exits must receive ALL output. Ending the pipe on the `exit`
        // event (rather than letting `.pipe({ end: true })` end it on EOF) would race the drain,
        // truncating trailing bytes and emitting a "write after end" error.
        const expectedBytes = 2_000_000;

        // A deliberately slow writable that applies heavy backpressure, so that unread data is
        // still buffered when the process exits.
        let received = 0;
        let sawError: Error | undefined;
        const slow = new stream.Writable({
            highWaterMark: 16 * 1024,
            write: (chunk: Buffer, _encoding: unknown, callback: () => void) => {
                received += chunk.length;
                setTimeout(callback, 10);
            },
        });
        slow.on('error', (err) => { sawError = err; });

        let caught: unknown;
        try {
            await spawnStreamAsync(
                process.execPath,
                ['-e', `process.stdout.write(Buffer.alloc(${expectedBytes}, 65)); process.exitCode = 3;`],
                {
                    stdOutPipe: slow,
                    allowUnsafeExecutablePath: true,
                },
            );
        } catch (err) {
            caught = err;
        }

        expect(isChildProcessError(caught), 'should reject with a ChildProcessError').to.be.true;

        // Wait for the slow writable to finish (or error) rather than for an accumulator.
        await settlesWithin(
            new Promise<void>((resolve) => {
                if (slow.writableFinished || sawError) {
                    resolve();
                } else {
                    slow.once('finish', () => resolve());
                    slow.once('error', () => resolve());
                }
            }),
            30_000,
            'slow destination',
        );

        expect(sawError, `destination should not receive a stream error (got: ${sawError?.message})`).to.be.undefined;
        expect(received, 'destination must receive the full output without truncation').to.equal(expectedBytes);
    });
});
