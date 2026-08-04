/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListContainersItem } from '../../contracts/ContainerClient';
import { dateStringWithFallbackSchema } from '../../contracts/ZodTransforms';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';

const AppleContainerNetworkAttachmentSchema = z.object({
    network: z.optional(z.string()),
});

/**
 * `container list --format json` emits a nested, non-Docker-like shape (captured against
 * real CLI 1.2.0 output): `{configuration: {id, image: {reference}, labels, networks, ...},
 * id, status: {state, networks, startedDate}}`. There is no flat `Names`/`Image`/`Ports`
 * record to reuse from `SharedListContainerRecordSchema`, so this keeps its own module.
 */
export const AppleContainerListContainerRecordSchema = z.object({
    id: z.string(),
    configuration: z.object({
        creationDate: z.optional(dateStringWithFallbackSchema),
        image: z.object({
            reference: z.optional(z.string()),
        }),
        labels: z.optional(z.record(z.string(), z.string())),
        networks: z.optional(z.array(AppleContainerNetworkAttachmentSchema)),
    }),
    status: z.object({
        state: z.optional(z.string()),
    }),
});

export type AppleContainerListContainerRecord = z.infer<typeof AppleContainerListContainerRecordSchema>;

/**
 * Normalize a parsed {@link AppleContainerListContainerRecord} to the common
 * {@link ListContainersItem}.
 */
export function normalizeAppleContainerListContainerRecord(container: AppleContainerListContainerRecord): ListContainersItem {
    return {
        id: container.id,
        // The `container` CLI has no name distinct from the container's ID -- `--name` (or
        // the auto-generated ID) is the same value in both places.
        name: container.id,
        labels: container.configuration.labels ?? {},
        image: parseDockerLikeImageName(container.configuration.image.reference),
        // `configuration.publishedPorts` shape hasn't been captured against a real `--publish`
        // run yet; left empty rather than guessing field names. Fill in once verified.
        ports: [],
        networks: (container.configuration.networks ?? [])
            .map((attachment) => attachment.network)
            .filter((name): name is string => !!name),
        createdAt: container.configuration.creationDate ?? new Date(0),
        // Observed values: 'running', 'stopped'. Passed through as-is; the contract's `state`
        // is a loosely-typed string, and no other values have been observed to map.
        state: container.status.state ?? 'unknown',
        // No human-readable status string (e.g. Docker's "Up 5 minutes") is emitted.
        status: undefined,
    };
}
