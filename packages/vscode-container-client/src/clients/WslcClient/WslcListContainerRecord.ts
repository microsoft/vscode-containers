/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListContainersItem, PortBinding } from '../../contracts/ContainerClient';
import { imageNameSchema, unixEpochSecondsSchema } from '../../contracts/ZodTransforms';
import { normalizeIpAddress } from '../DockerClientBase/normalizeIpAddress';

const WslcListContainerPortBindingSchema = z.object({
    // wslc emits the host bind address as `BindingAddress` and the protocol as an
    // IANA protocol number (6 = TCP, 17 = UDP), not Docker's string form.
    BindingAddress: z.optional(z.string()),
    HostPort: z.optional(z.number()),
    ContainerPort: z.optional(z.number()),
    Protocol: z.optional(z.number()),
});

/**
 * `wslc list --format json` emits an object-shaped record (structured `Ports`
 * array, numeric `State`, epoch `CreatedAt`, `Networks`/`Labels` collections)
 * rather than the flat, comma-delimited strings that Docker's `container ls`
 * produces, so it keeps its own record module instead of sharing
 * `SharedListContainerRecordSchema`.
 */
export const WslcListContainerRecordSchema = z.object({
    Id: z.string(),
    Name: z.optional(z.string()),
    // Raw image reference parsed into an ImageNameInfo by the shared transform
    Image: imageNameSchema,
    // Epoch seconds transformed to a Date by the shared transform
    CreatedAt: unixEpochSecondsSchema,
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

/**
 * Map the IANA protocol number wslc reports for a port binding onto the protocol
 * names used by the {@link PortBinding} contract.
 */
function mapWslcProtocol(protocol: number | undefined): 'tcp' | 'udp' | undefined {
    switch (protocol) {
        case 6:
            return 'tcp';
        case 17:
            return 'udp';
        default:
            return undefined;
    }
}

function normalizePorts(rawPorts: WslcListContainerRecord['Ports']): PortBinding[] {
    return (rawPorts ?? []).flatMap((port) => {
        // wslc can emit a binding without a ContainerPort; skip it rather than
        // fabricating containerPort: 0, since containerPort is required by the contract.
        if (port.ContainerPort === undefined) {
            return [];
        }

        // Match the Docker port parser: when wslc doesn't report a bind address,
        // omit hostIp rather than fabricating one, so an all-interfaces publish
        // isn't mislabeled as loopback (127.0.0.1).
        const hostIp = normalizeIpAddress(port.BindingAddress);

        return [{
            containerPort: port.ContainerPort,
            ...(hostIp !== undefined ? { hostIp } : {}),
            hostPort: port.HostPort,
            protocol: mapWslcProtocol(port.Protocol),
        } satisfies PortBinding];
    });
}

/**
 * Normalize a parsed {@link WslcListContainerRecord} to the common
 * {@link ListContainersItem}. The image name and creation date are already
 * normalized by the schema transforms.
 */
export function normalizeWslcListContainerRecord(container: WslcListContainerRecord): ListContainersItem {
    return {
        id: container.Id,
        name: container.Name ?? '',
        image: container.Image,
        labels: container.Labels ?? {},
        createdAt: container.CreatedAt,
        ports: normalizePorts(container.Ports),
        networks: container.Networks ?? [],
        state: mapWslcContainerState(container.State),
        // wslc `list` has no human-readable status string
        status: undefined,
    };
}
