/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RegistryWizardContext } from "./RegistryWizardContext";
import { RegistryWizardPromptStep } from "./RegistryWizardPromptStep";

export class RegistryWizard<T extends RegistryWizardContext> {
    private readonly promptSteps: RegistryWizardPromptStep<T>[];
    private readonly context: T;

    public constructor(context: T, steps: RegistryWizardPromptStep<T>[]) {
        this.promptSteps = steps.reverse();
        this.context = context;
    }

    public async prompt(): Promise<void> {
        let step: RegistryWizardPromptStep<T> | undefined = this.promptSteps.pop();

        while (step) {
            if (step.shouldPrompt(this.context)) {
                await step.prompt(this.context);
            }

            step = this.promptSteps.pop();
        }
    }
}
