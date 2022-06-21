/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as stream from 'stream';
import * as streamPromise from 'stream/promises';
import {
    CommandResponse,
    CommandResponseLike,
    CommandRunner,
    ICommandRunnerFactory,
    normalizeCommandResponseLike,
} from '../contracts/CommandRunner';
import { CancellationTokenLike } from '../typings/CancellationTokenLike';
import { AccumulatorStream } from '../utils/AccumulatorStream';
import { CancellationError } from '../utils/CancellationError';
import { powershellQuote, spawnStreamAsync, StreamSpawnOptions } from '../utils/spawnStreamAsync';

export type ShellStreamCommandRunnerOptions = StreamSpawnOptions & {
    strict?: boolean;
};

export class ShellStreamCommandRunnerFactory<TOptions extends ShellStreamCommandRunnerOptions> implements ICommandRunnerFactory {
    public constructor(protected readonly options: TOptions) {
    }

    public getCommandRunner(): CommandRunner {
        return async <T>(commandResponseLike: CommandResponseLike<T>) => {
            const commandResponse = await normalizeCommandResponseLike(commandResponseLike);
            const { command, args } = this.getCommandAndArgs(commandResponse);

            throwIfCancellationRequested(this.options.cancellationToken);

            let result: T | undefined;

            const splitterStream = new stream.PassThrough;
            const pipelinePromises: Promise<void>[] = [];

            let accumulator: AccumulatorStream | undefined;

            try {
                if (commandResponse.parse) {
                    accumulator = new AccumulatorStream();
                    pipelinePromises.push(
                        streamPromise.pipeline(splitterStream, accumulator)
                    );
                }

                if (this.options.stdOutPipe) {
                    pipelinePromises.push(
                        streamPromise.pipeline(splitterStream, this.options.stdOutPipe)
                    );
                }

                await spawnStreamAsync(command, args, { ...this.options, stdOutPipe: splitterStream, shell: true });

                throwIfCancellationRequested(this.options.cancellationToken);

                if (accumulator && commandResponse.parse) {
                    const output = await accumulator.getString();
                    throwIfCancellationRequested(this.options.cancellationToken);
                    result = await commandResponse.parse(output, !!this.options.strict);
                }

                throwIfCancellationRequested(this.options.cancellationToken);

                await Promise.all(pipelinePromises);

                return result;
            } finally {
                accumulator?.destroy();
            }
        };
    }

    protected getCommandAndArgs(commandResponse: CommandResponse<unknown>): { command: string, args: string[] } {
        return {
            command: commandResponse.command,
            args: powershellQuote(commandResponse.args)
        };
    }
}

function throwIfCancellationRequested(token?: CancellationTokenLike): void {
    if (token?.isCancellationRequested) {
        throw new CancellationError('Command cancelled', token);
    }
}
