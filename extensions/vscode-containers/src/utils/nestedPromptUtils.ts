/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzureUserInput } from '@microsoft/vscode-azext-utils';

/**
 * `AzureWizard` tracks state on the action context that isn't part of the public API surface of
 * `@microsoft/vscode-azext-utils`, so it has to be reached through these casts.
 */
type WizardStateContext = IActionContext & { suppressLoadingPrompt?: boolean };
type UserInputWithWizard = IAzureUserInput & { wizard?: unknown };

/**
 * Runs a callback that starts a nested `AzureWizard` sharing the given context--e.g. `subscriptionExperience()`
 * or `createAzureRegistry()`--and restores the outer wizard's registration afterwards.
 *
 * While prompting, `AzureWizard` registers itself as `context.ui.wizard` and unconditionally clears that
 * registration when it finishes. Because the nested wizard shares the outer wizard's `ui`, its cleanup leaves
 * the outer wizard unregistered for the remainder of its steps, so the outer wizard's later prompts silently
 * lose their title, step count, back button, and cancellation checks. If there is no outer wizard, this is a
 * no-op.
 */
export async function preserveOuterWizard<T>(context: IActionContext, callback: () => Promise<T>): Promise<T> {
    const ui = context.ui as UserInputWithWizard;
    const outerWizard = ui.wizard;

    try {
        return await callback();
    } finally {
        ui.wizard = outerWizard;
    }
}

/**
 * Runs a callback that shows UI the outer wizard has no knowledge of--i.e. a command invoked with
 * `executeCommand()`, which gets an action context (and therefore a `ui`) of its own--and restores the outer
 * wizard's loading prompt afterwards.
 *
 * A wizard configured with `showLoadingPrompt` keeps a "Loading..." quick pick visible for the duration of
 * each step, and treats that quick pick being hidden as the user dismissing the wizard unless its own `ui` is
 * what's currently prompting. UI shown by a separate action context hides it without setting that flag, which
 * silently cancels the outer wizard. If there is no outer wizard, this is a no-op.
 *
 * Note this deliberately isn't combined with {@link preserveOuterWizard}: a nested wizard sharing this context
 * would read the same suppression flag, and would lose its own loading prompt as a result.
 */
export async function suppressOuterLoadingPrompt<T>(context: IActionContext, callback: () => Promise<T>): Promise<T> {
    const wizardStateContext = context as WizardStateContext;
    const previous = wizardStateContext.suppressLoadingPrompt;
    wizardStateContext.suppressLoadingPrompt = true;

    try {
        return await callback();
    } finally {
        wizardStateContext.suppressLoadingPrompt = previous;
    }
}
