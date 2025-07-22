/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { AccumulatorStream } from '../utils/AccumulatorStream';
import { composeArgs, withArg, withNamedArg } from '../utils/commandLineBuilder';
import { NoShell, Shell } from '../utils/Shell';
import { spawnStreamAsync } from '../utils/spawnStreamAsync';

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
