/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

const WslcListContainerPortBindingSchema = z.object({
    // wslc emits the host bind address as `BindingAddress` and the protocol as an
    // IANA protocol number (6 = TCP, 17 = UDP), not Docker's string form.
    BindingAddress: z.optional(z.string()),
    HostPort: z.optional(z.number()),
    ContainerPort: z.optional(z.number()),
    Protocol: z.optional(z.number()),
});

export const WslcListContainerRecordSchema = z.object({
    Id: z.string(),
    Name: z.optional(z.string()),
    Image: z.optional(z.string()),
    CreatedAt: z.number(),
    StateChangedAt: z.optional(z.number()),
    // State is a numeric enum from wslc; we map it via mapWslcContainerState below.
    State: z.optional(z.number()),
    Ports: z.nullish(z.array(WslcListContainerPortBindingSchema)),
    Labels: z.nullish(z.record(z.string(), z.string())),
    Networks: z.nullish(z.array(z.string())),
});

export type WslcListContainerRecord = z.infer<typeof WslcListContainerRecordSchema>;

/**
 * Map the numeric `State` field returned by `wslc list --format json` to the
 * string values used in the {@link ListContainersItem} contract.
 *
 * `1 = created`, `2 = running`, `3 = exited`;
 * `stop`/`kill` also report `3`. wslc has no `pause`/`unpause` or `restart`
 * subcommands, so paused/restarting states are not expected. Any other value
 * falls through to `'unknown'` so we don't speculate.
 */
export function mapWslcContainerState(state: number | undefined): string {
    switch (state) {
        case 1:
            return 'created';
        case 2:
            return 'running';
        case 3:
            return 'exited';
        default:
            return 'unknown';
    }
}
