/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, Memento, SecretStorage } from "vscode";
import { TestMemento } from "./TestMemento";
import { TestSecretStorage } from "./TestSecretStorage";

export class TestExtensionContext implements Partial<ExtensionContext> {
    public readonly globalState = new TestMemento() as unknown as Memento & { setKeysForSync(keys: string[]): void } & TestMemento;
    public readonly secrets = new TestSecretStorage() as unknown as SecretStorage & TestSecretStorage;
}
