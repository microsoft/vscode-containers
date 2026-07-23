/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    AccumulatorStream,
    CancellationError,
    CancellationTokenLike,
    type CommandLineArgs,
    spawnStreamAsync,
    type StreamSpawnOptions
} from '@microsoft/vscode-processutils';
import * as stream from 'stream';
import {
    type CommandResponseBase,
    type CommandRunner,
    type GeneratorCommandResponse,
    type ICommandRunnerFactory,
    type Like,
    normalizeCommandResponseLike,
    type PromiseCommandResponse,
    type StreamingCommandRunner,
    type VoidCommandResponse,
} from '../contracts/CommandRunner';

export type ShellStreamCommandRunnerOptions = StreamSpawnOptions & {
    strict?: boolean;
};

/**
 * A {@link CommandRunnerFactory} that executes commands on a given shell and
 * manages access to the necessary stdio streams
 */
export class ShellStreamCommandRunnerFactory<TOptions extends ShellStreamCommandRunnerOptions> implements ICommandRunnerFactory {
    public constructor(protected readonly options: TOptions) { }

    public getCommandRunner(): CommandRunner {
        return async <T>(commandResponseLike: Like<VoidCommandResponse> | Like<PromiseCommandResponse<T>>) => {
            const commandResponse = await normalizeCommandResponseLike(commandResponseLike);
            const { command, args } = this.getCommandAndArgs(commandResponse);

            throwIfCancellationRequested(this.options.cancellationToken);

            let result: T | undefined;

            let accumulator: AccumulatorStream | undefined;

            try {
                if (commandResponse.parse) {
                    accumulator = new AccumulatorStream();
                }

                // Determine the appropriate combination of streams that need to read from stdout
                let stdOutPipe: NodeJS.WritableStream | undefined = accumulator;
                if (accumulator && this.options.stdOutPipe) {
                    const stdOutPassThrough = new stream.PassThrough();
                    stdOutPassThrough.pipe(this.options.stdOutPipe);
                    stdOutPassThrough.pipe(accumulator);

                    stdOutPipe = stdOutPassThrough;
                } else if (this.options.stdOutPipe) {
                    stdOutPipe = this.options.stdOutPipe;
                }

                await spawnStreamAsync(command, args, { ...this.options, stdOutPipe: stdOutPipe });

                throwIfCancellationRequested(this.options.cancellationToken);

                if (accumulator && commandResponse.parse) {
                    const output = await accumulator.getString();
                    throwIfCancellationRequested(this.options.cancellationToken);
                    result = await commandResponse.parse(output, !!this.options.strict);
                }

                throwIfCancellationRequested(this.options.cancellationToken);

                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                return result!;
            } finally {
                accumulator?.destroy();
            }
        };
    }

    public getStreamingCommandRunner(): StreamingCommandRunner {
        return this.streamingCommandRunner.bind(this);
    }

    private async *streamingCommandRunner<T>(commandResponseLike: Like<GeneratorCommandResponse<T>>): AsyncGenerator<T> {
        const commandResponse = await normalizeCommandResponseLike(commandResponseLike);
        const { command, args } = this.getCommandAndArgs(commandResponse);

        throwIfCancellationRequested(this.options.cancellationToken);

        const dataStream: stream.PassThrough = new stream.PassThrough();
        const innerGenerator = commandResponse.parseStream(dataStream, !!this.options.strict);

        const localAbortController = new AbortController();
        const externalCancellationDisposable = this.options.cancellationToken?.onCancellationRequested(() => localAbortController.abort());
        const cancellationToken = CancellationTokenLike.fromAbortSignal(localAbortController.signal);

        // The process promise will be awaited only after the innerGenerator finishes
        const processPromise = spawnStreamAsync(command, args, {
            ...this.options,
            cancellationToken,
            stdOutPipe: dataStream,
        });

        let streamFullyConsumed = false;

        try {
            for await (const element of innerGenerator) {
                yield element;
            }

            streamFullyConsumed = true;
            await processPromise;
        } finally {
            externalCancellationDisposable?.dispose();
            localAbortController.abort();
            dataStream.end();

            // If the consumer stopped iteration early, ensure the child process is
            // fully terminated so test runs don't hang on open handles. We just
            // aborted it above, so any rejection here is expected and intentionally
            // ignored; errors from normal completion are surfaced by the awaited
            // processPromise above.
            if (!streamFullyConsumed) {
                await processPromise.catch(() => { /* ignore abort/termination errors during cleanup */ });
            }
        }
    }

    protected getCommandAndArgs(commandResponse: CommandResponseBase): { command: string, args: CommandLineArgs } {
        return commandResponse;
    }
}

function throwIfCancellationRequested(token?: CancellationTokenLike): void {
    if (token?.isCancellationRequested) {
        throw new CancellationError('Command cancelled', token);
    }
}
