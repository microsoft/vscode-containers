/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Position, ResultProgressReporter, WorkDoneProgressReporter } from 'vscode-languageserver';
import { ExtendedParams, ExtendedPositionParams } from '../ExtendedParams';
import { ExtendedPosition } from '../ExtendedPosition';
import { Lazy } from '../utils/Lazy';
import { ProviderBase } from './ProviderBase';

export abstract class MultiProviderBase<P extends ExtendedParams & { position: Position }, R, PR> extends ProviderBase<P, R | undefined, PR, never> {
    protected readonly subproviders: SubproviderBase<P & ExtendedPositionParams, R, PR>[] = [];

    public register(subprovider: SubproviderBase<P & ExtendedPositionParams, R, PR>): void {
        this.subproviders.push(subprovider);
    }

    public on(params: P, token: CancellationToken, workDoneProgress: WorkDoneProgressReporter, resultProgress?: ResultProgressReporter<PR>): R | undefined {
        // TODO: when working through a signature the client makes many requests; is it wasteful to recompute the position like this every time?
        // Does that apply only to signatures or to completions too?
        const extendedParams: P & ExtendedPositionParams = {
            ...params,
            extendedPosition: new Lazy<ExtendedPosition>(() => ExtendedPosition.build(params.document, params.position)),
        };

        const subresults: (R | undefined)[] = [];

        for (const subprovider of this.subproviders) {
            // Within each loop we'll check for cancellation
            if (token.isCancellationRequested) {
                return undefined;
            }

            subresults.push(subprovider.on(extendedParams, token, workDoneProgress, resultProgress));
        }

        return this.reduce(subresults);
    }

    protected abstract reduce(subresults: (R | undefined)[]): R | undefined;
}

export interface SubproviderBase<P extends ExtendedPositionParams, R, PR> {
    on: (params: P, token: CancellationToken, workDoneProgress: WorkDoneProgressReporter, resultProgress?: ResultProgressReporter<PR>) => R | undefined;
}
