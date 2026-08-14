/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzureUserInput } from '@microsoft/vscode-azext-utils';

/**
 * While prompting, `AzureWizard` registers itself on the shared `context.ui` object, and unconditionally
 * clears that registration when it finishes. The property is internal to `@microsoft/vscode-azext-utils`
 * and therefore isn't declared on {@link IAzureUserInput}.
 */
type AzExtUserInputWithWizard = IAzureUserInput & { wizard?: unknown };

/**
 * Runs a callback that starts a nested `AzureWizard` of its own--e.g. `subscriptionExperience()` or
 * `createAzureRegistry()`--and restores the outer wizard's registration afterwards.
 *
 * Without this, the nested wizard's cleanup leaves the outer wizard unregistered for the remainder of its
 * steps, so its later prompts silently lose the wizard title, step count, back button, and cancellation
 * checks. If there is no outer wizard, this is a no-op.
 */
export async function preserveOuterWizard<T>(context: IActionContext, callback: () => Promise<T>): Promise<T> {
    const ui = context.ui as AzExtUserInputWithWizard;
    const outerWizard = ui.wizard;

    try {
        return await callback();
    } finally {
        ui.wizard = outerWizard;
    }
}
