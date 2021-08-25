/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Position, ResultProgressReporter, WorkDoneProgressReporter } from 'vscode-languageserver';
import { ExtendedParams, ExtendedPositionParams } from '../ExtendedParams';
import { ExtendedPosition } from '../ExtendedPosition';
import { ProviderBase } from './ProviderBase';

export abstract class MultiProviderBase<P extends ExtendedParams & { position: Position }, R, PR> extends ProviderBase {
    protected readonly subproviders: SubproviderBase<P & ExtendedPositionParams, R, PR>[] = [];

    public register(subprovider: SubproviderBase<P & ExtendedPositionParams, R, PR>): void {
        this.subproviders.push(subprovider);
    }

    public on(params: P, token: CancellationToken, workDoneProgress: WorkDoneProgressReporter, resultProgress?: ResultProgressReporter<PR>): R | undefined {
        const extendedParams: P & ExtendedPositionParams = {
            ...params,
            extendedPosition: ExtendedPosition.build(params.document, params.position),
        };

        const subresults: (R | undefined)[] = [];

        for (const subprovider of this.subproviders) {
            subresults.push(subprovider.on(extendedParams, token, workDoneProgress, resultProgress));
        }

        return this.reduce(subresults);
    }

    protected abstract reduce(subresults: (R | undefined)[]): R | undefined;
}

export interface SubproviderBase<P extends ExtendedPositionParams, R, PR> {
    on: (params: P, token: CancellationToken, workDoneProgress: WorkDoneProgressReporter, resultProgress?: ResultProgressReporter<PR>) => R | undefined;
}
