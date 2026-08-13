/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CommandLineArgs } from '@microsoft/vscode-processutils';
import type { GeneratorCommandResponse, PromiseCommandResponse, VoidCommandResponse } from '../contracts/CommandRunner';
import type { ClientIdentity } from '../contracts/ContainerClient';

export abstract class ConfigurableClient implements ClientIdentity {
    public constructor(
        public readonly id: string,
        commandName: string,
        displayName: string,
        description: string
    ) {
        this.#commandName = commandName;
        this.#defaultCommandName = commandName;
        this.#displayName = displayName;
        this.#description = description;
    }

    #commandName: string;
    public get commandName(): string {
        return this.#commandName;
    }

    public set commandName(value: string) {
        this.#commandName = value;
    }

    readonly #defaultCommandName: string;
    public get defaultCommandName(): string {
        return this.#defaultCommandName;
    }

    #displayName: string;
    public get displayName(): string {
        return this.#displayName;
    }

    public set displayName(value: string) {
        this.#displayName = value;
    }

    #description: string;
    public get description(): string {
        return this.#description;
    }

    public set description(value: string) {
        this.#description = value;
    }

    /**
     * Builds the standard {@link PromiseCommandResponse} produced by the public
     * command wrapper methods, eliminating the repeated
     * `{ command: this.commandName, args, parse }` boilerplate.
     * @param args The command line arguments to run
     * @param parse Parses/normalizes the command output
     */
    protected makeCommandResponse<TResult>(
        args: CommandLineArgs,
        parse: (output: string, strict: boolean) => Promise<TResult>,
    ): Promise<PromiseCommandResponse<TResult>> {
        return Promise.resolve({
            command: this.commandName,
            args,
            parse,
        });
    }

    /**
     * Builds a {@link VoidCommandResponse} for command wrappers that produce no
     * parsed result.
     * @param args The command line arguments to run
     */
    protected makeVoidCommandResponse(
        args: CommandLineArgs,
    ): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args,
        });
    }

    /**
     * Builds a {@link GeneratorCommandResponse} for streaming command wrappers.
     * @param args The command line arguments to run
     * @param parseStream Parses/normalizes the streamed command output
     */
    protected makeStreamCommandResponse<TResult>(
        args: CommandLineArgs,
        parseStream: (output: NodeJS.ReadableStream, strict: boolean) => AsyncGenerator<TResult>,
    ): Promise<GeneratorCommandResponse<TResult>> {
        return Promise.resolve({
            command: this.commandName,
            args,
            parseStream,
        });
    }
}
