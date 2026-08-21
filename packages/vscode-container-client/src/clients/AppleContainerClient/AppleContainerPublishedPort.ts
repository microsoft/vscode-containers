/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { PortBinding } from '../../contracts/ContainerClient';

/**
 * `configuration.publishedPorts[]` -- shared by both `list --format json` and `inspect` output
 * (confirmed identical in both against real CLI 1.2.0, captured from a `-p 9090:80 -p
 * 127.0.0.1:9091:81/udp` run).
 */
export const AppleContainerPublishedPortSchema = z.object({
    containerPort: z.optional(z.number()),
    hostPort: z.optional(z.number()),
    hostAddress: z.optional(z.string()),
    proto: z.optional(z.string()),
    count: z.optional(z.number()),
});

export type AppleContainerPublishedPort = z.infer<typeof AppleContainerPublishedPortSchema>;

/**
 * Normalize `configuration.publishedPorts[]` into {@link PortBinding}s. A `count > 1` entry
 * represents a contiguous published range (e.g. `-p 9090-9092:80-82` reports one entry with
 * `count: 3`, not three entries); expand it into `count` individual bindings with the container
 * and host ports incrementing together, since {@link PortBinding} has no range concept of its
 * own.
 */
export function normalizeAppleContainerPublishedPorts(ports: Array<AppleContainerPublishedPort> | undefined): Array<PortBinding> {
    return (ports ?? []).flatMap((port) => {
        const containerPort = port.containerPort;
        if (typeof containerPort !== 'number') {
            return [];
        }

        const count = port.count ?? 1;
        return Array.from({ length: count }, (_, offset) => ({
            containerPort: containerPort + offset,
            hostPort: typeof port.hostPort === 'number' ? port.hostPort + offset : undefined,
            hostIp: port.hostAddress,
            protocol: port.proto === 'udp' ? 'udp' as const : 'tcp' as const,
        }));
    });
}
