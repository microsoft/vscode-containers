/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as async from 'async_hooks';
import { Connection, ErrorCodes, ResponseError } from 'vscode-languageserver';
import type { ComposeLanguageClientCapabilities } from '../../client/ClientCapabilities';
import { TelemetryEvent } from '../../client/TelemetryEvent';

const als = new async.AsyncLocalStorage<ActionContext>();

export interface ActionContext {
    clientCapabilities: ComposeLanguageClientCapabilities;
    connection: Connection;
    telemetry: TelemetryEvent;
}

export function getCurrentContext(): ActionContext {
    const ctx = als.getStore();

    if (!ctx) {
        throw new ResponseError(ErrorCodes.InternalError, 'Failed to get action context');
    }

    return ctx;
}

export function runWithContext<R>(context: ActionContext, callback: () => R): R {
    return als.run(context, callback);
}
