/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface RegistryWizardContext {
    readonly usernamePrompt?: string;

    readonly secretPrompt?: string;

    username?: string;

    secret?: string;
}
