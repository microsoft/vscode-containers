/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Memento } from "vscode";

export class TestMemento implements Partial<Memento> {
    public readonly cache: { [key: string]: unknown } = {};

    public get<T>(key: string): T | undefined;
    public get<T>(key: string, defaultValue: T): T;
    public get(key: string, defaultValue?: unknown): unknown {
        return this.cache[key] ?? defaultValue;
    }

    public async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            delete this.cache[key];
        } else {
            this.cache[key] = value;
        }
    }
}
