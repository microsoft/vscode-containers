/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class TestMemento implements vscode.Memento {
    private readonly values: Record<string, unknown> = {};

    keys(): readonly string[] {
        return Object.keys(this.values);
    }

    get<T>(key: string, defaultValue?: T): T | undefined {
        return (this.values[key] as T | undefined) ?? defaultValue;
    }

    update(key: string, value: unknown): Thenable<void> {
        if (value === undefined) {
            delete this.values[key];
        } else {
            this.values[key] = value;
        }

        return Promise.resolve();
    }
}
