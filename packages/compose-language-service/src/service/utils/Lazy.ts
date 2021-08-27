/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class Lazy<T> {
    private _value: T | undefined;

    public constructor(private readonly valueFactory: () => T) {
    }

    public get value(): T {
        if (!this._value) {
            this._value = this.valueFactory();
        }

        return this._value;
    }
}
