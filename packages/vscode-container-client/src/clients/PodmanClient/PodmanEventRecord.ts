/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventAction, EventType } from "../../contracts/ContainerClient";

export type PodmanEventRecord = {
    ID?: string; // Not in v3
    Type: EventType;
    Status: EventAction;
    Name: string;
    Time?: string; // Not in v5
    time?: number; // Not in v3, v4
    Attributes?: Record<string, unknown>;
};

export function isPodmanEventRecord(maybeEvent: unknown): maybeEvent is PodmanEventRecord {
    const event = maybeEvent as PodmanEventRecord;

    if (!event || typeof event !== 'object') {
        return false;
    }

    if (typeof event.Type !== 'string') {
        return false;
    }

    if (typeof event.Status !== 'string') {
        return false;
    }

    if (typeof event.Name !== 'string') {
        return false;
    }

    if (typeof event.Time !== 'string' && typeof event.time !== 'number') {
        return false;
    }

    return true;
}
