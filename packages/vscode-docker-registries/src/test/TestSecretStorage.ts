/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SecretStorage } from "vscode";

export class TestSecretStorage implements Partial<SecretStorage> {
    public readonly cache: { [key: string]: string } = {};

    public get(key: string): Promise<string | undefined> {
        return Promise.resolve(this.cache[key]);
    }

    public store(key: string, value: string): Promise<void> {
        this.cache[key] = value;
        return Promise.resolve();
    }

    public delete(key: string): Promise<void> {
        delete this.cache[key];
        return Promise.resolve();
    }
}
