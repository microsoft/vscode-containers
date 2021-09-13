/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CompletionItem, CompletionParams } from 'vscode-languageserver';
import { ExtendedPositionParams } from '../../ExtendedParams';
import { SubproviderBase } from '../MultiProviderBase';
import { CompletionCollection } from './CompletionCollection';

const RootCompletions = new CompletionCollection(...[
]);

export class RootCompletionProvider implements SubproviderBase<CompletionParams & ExtendedPositionParams, CompletionItem[] | undefined, never> {
    public on(params: CompletionParams & ExtendedPositionParams, token: CancellationToken): CompletionItem[] | undefined {
        if (!/^\/[^/]*$/i.test(params.extendedPosition.value.logicalPath)) {
            return undefined;
        }

        return RootCompletions.getActiveCompletionItems(params);
    }
}
