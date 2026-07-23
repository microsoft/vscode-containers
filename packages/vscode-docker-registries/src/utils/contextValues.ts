/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RegistryItem, isContextValueRegistryItem } from '../contracts/RegistryItem';

export function getContextValue(element: RegistryItem, ...additional: string[]): string {
    const providedContextValues = isContextValueRegistryItem(element) ? element.additionalContextValues ?? [] : [];

    const allContextValues = [...additional, ...providedContextValues];
    const contextValueSet = new Set(allContextValues);
    return Array.from(contextValueSet).sort().join(';');
}
