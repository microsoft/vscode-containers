/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError, window } from 'vscode';
import { RegistryWizardPromptStepOptions } from "./RegistryWizardPromptStep";

export async function showInputBox(options: RegistryWizardPromptStepOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        const inputBox = window.createInputBox();

        inputBox.prompt = options.prompt;
        inputBox.placeholder = options.placeholder;
        inputBox.ignoreFocusOut = true;
        inputBox.password = !!options.isSecretStep;

        inputBox.onDidAccept(() => {
            resolve(inputBox.value);
            inputBox.dispose();
        });
        inputBox.onDidHide(() => {
            reject(new CancellationError());
            inputBox.dispose();
        });
        inputBox.onDidChangeValue(async text => {
            if (options.validateInput) {
                inputBox.validationMessage = await options.validateInput(text);
            }
        });

        inputBox.show();
    });
}
