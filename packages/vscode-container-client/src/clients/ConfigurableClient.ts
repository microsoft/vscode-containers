/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
}
