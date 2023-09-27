/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { l10n } from "vscode";
import { RegistryWizardContext } from "./RegistryWizardContext";
import { showInputBox } from "./showInputBox";


export interface RegistryWizardPromptStepOptions {
    isSecretStep?: boolean;
    prompt: string;
    placeholder?: string;
    validateInput?(value: string): string | undefined | Thenable<string | undefined>;
}

export abstract class RegistryWizardPromptStep<T extends RegistryWizardContext> {
    public abstract prompt(wizardContext: T): Promise<void>;
    public abstract shouldPrompt(wizardContext: T): boolean;
}

/**
 * A prompt step that prompts for a username.
 */
export class RegistryWizardUsernamePromptStep<T extends RegistryWizardContext> extends RegistryWizardPromptStep<T> {
    public async prompt(wizardContext: T): Promise<void> {
        wizardContext.username = await showInputBox({ isSecretStep: false, prompt: wizardContext.usernamePrompt || l10n.t('Enter your username, or press \'Enter\' for none') });
    }

    public shouldPrompt(wizardContext: T): boolean {
        return !!wizardContext.usernamePrompt && !wizardContext.username;
    }
}

/**
 * A prompt step that prompts for a password.
 */
export class RegistryWizardSecretPromptStep<T extends RegistryWizardContext> extends RegistryWizardPromptStep<T>{
    public async prompt(wizardContext: T): Promise<void> {
        wizardContext.secret = await showInputBox({ isSecretStep: true, prompt: wizardContext.secretPrompt || l10n.t('Enter your password') });
    }

    public shouldPrompt(wizardContext: T): boolean {
        return !!wizardContext.secretPrompt && !wizardContext.secret;
    }
}

/**
 * A prompt step that prompts for a username and requires it to be non-empty.
 */
export class RegistryWizardRequiredUsernamePromptStep<T extends RegistryWizardContext> extends RegistryWizardUsernamePromptStep<T> {
    public override async prompt(wizardContext: T): Promise<void> {
        const options: RegistryWizardPromptStepOptions = {
            isSecretStep: false,
            prompt: wizardContext.usernamePrompt || l10n.t('Enter your username'),
            validateInput: (value: string): string | undefined => this.validateInput(value),
        };

        wizardContext.username = await showInputBox(options);
    }

    private validateInput(value: string): string | undefined {
        if (!value) {
            return l10n.t('Username cannot be empty.');
        }

        return undefined;
    }
}
