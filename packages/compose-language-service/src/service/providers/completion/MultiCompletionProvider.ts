/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CompletionItem, CompletionParams, WorkDoneProgressReporter } from 'vscode-languageserver';
import { ExtendedCompletionParams, ExtendedParams, ExtendedPositionParams } from '../../ExtendedParams';
import { getCurrentContext } from '../../utils/ActionContext';
import { ProviderBase } from '../ProviderBase';
import { BuildCompletionCollection } from './BuildCompletionCollection';
import { CompletionCollection } from './CompletionCollection';
import { PortsCompletionCollection } from './PortsCompletionCollection';
import { RootCompletionCollection } from './RootCompletionCollection';
import { ServiceCompletionCollection } from './ServiceCompletionCollection';
import { VolumesCompletionCollection } from './VolumesCompletionCollection';

/**
 * Completions are one of the more involved features so we will split up the code, with this multi-provider calling each of them
 * Most will no-op but the results will all be aggregated upon return
 * Importantly, if any fail, we will throw an error--all other results will be ignored
 */
export class MultiCompletionProvider extends ProviderBase<CompletionParams & ExtendedParams, CompletionItem[] | undefined, never, never> {
    private readonly completionCollections: CompletionCollection[];

    public constructor(private readonly basicCompletions: boolean, private readonly advancedCompletions: boolean) {
        super();

        this.completionCollections = [
            RootCompletionCollection,
            ServiceCompletionCollection,
            BuildCompletionCollection,
            VolumesCompletionCollection,
            PortsCompletionCollection,
        ];
    }

    public override async on(params: CompletionParams & ExtendedPositionParams, token: CancellationToken, workDoneProgress: WorkDoneProgressReporter): Promise<CompletionItem[] | undefined> {
        const ctx = getCurrentContext();

        const extendedParams: ExtendedCompletionParams = {
            ...params,
            positionInfo: await params.document.getPositionInfo(params),
            basicCompletions: this.basicCompletions,
            advancedCompletions: this.advancedCompletions,
        };

        const results: CompletionItem[] = [];
        const respondingCollections: string[] = [];

        for (const collection of this.completionCollections) {
            // Within each loop we'll check for cancellation
            if (token.isCancellationRequested) {
                return undefined;
            }

            const subresults = collection.getActiveCompletionItems(extendedParams);

            if (subresults?.length) {
                respondingCollections.push(collection.name);
                results.push(...subresults);
            }

            // The set of collections that answer will be attached as a property
            ctx.telemetry.properties.respondingCollections = respondingCollections.sort().join(',');
        }

        // It should be noted, many of the completions include tabs `\t` which aren't allowed in YAML, however,
        // VSCode automatically translates these into the configured tab size in spaces. It does the same for line endings.

        return results.length > 0 ? results : undefined;
    }
}
