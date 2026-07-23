/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError, window, Disposable } from 'vscode';
import { RegistryWizardPromptStepOptions } from "./RegistryWizardPromptStep";

export async function showInputBox(options: RegistryWizardPromptStepOptions): Promise<string> {
    const disposables: Disposable[] = [];
    try {
        return await new Promise((resolve, reject) => {
            const inputBox = window.createInputBox();
            disposables.push(inputBox);

            inputBox.prompt = options.prompt;
            inputBox.placeholder = options.placeholder;
            inputBox.ignoreFocusOut = true;
            inputBox.password = !!options.isSecretStep;

            inputBox.onDidAccept(async () => {
                // disable user input and show progress indicator
                inputBox.enabled = false;
                inputBox.busy = true;

                // if there is validation logic, run it, otherwise just resolve
                const asyncValidationResult = options.validateInput ? await options.validateInput(inputBox.value) : undefined;
                if (!asyncValidationResult) {
                    resolve(inputBox.value);
                } else {
                    inputBox.validationMessage = asyncValidationResult;
                }


                // re-enable user input
                inputBox.enabled = true;
                inputBox.busy = false;
            });
            inputBox.onDidHide(() => {
                reject(new CancellationError());
            });
            inputBox.onDidChangeValue(async text => {
                if (options.validateInput) {
                    inputBox.validationMessage = await options.validateInput(text);
                }
            });

            inputBox.show();
        });
    } finally {
        disposables.forEach(d => { d.dispose(); });
    }
}
