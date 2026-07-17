/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Lazy<T> {
    /* private */ #value: T | undefined;

    public constructor(private readonly valueFactory: () => T) {
    }

    public get value(): T {
        if (this.#value === undefined) {
            this.#value = this.valueFactory();
        }

        return this.#value;
    }

    public hasValue(): boolean {
        return (this.#value !== undefined);
    }

    public clear(): void {
        this.#value = undefined;
    }
}
