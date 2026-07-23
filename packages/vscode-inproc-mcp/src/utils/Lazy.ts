/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Lazy<T> {
    #value: T | undefined;
    #isValueCreated: boolean = false;

    constructor(private readonly factory: () => T) { }

    public get value(): T {
        if (!this.#isValueCreated) {
            this.#value = this.factory();
            this.#isValueCreated = true;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.#value!;
    }
}
