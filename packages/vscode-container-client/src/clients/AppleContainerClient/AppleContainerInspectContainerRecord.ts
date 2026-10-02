/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { InspectContainersItem, InspectContainersItemMount, InspectContainersItemNetwork } from '../../contracts/ContainerClient';
import { dateStringWithFallbackSchema } from '../../contracts/ZodTransforms';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { parseDockerLikeEnvironmentVariables } from '../DockerClientBase/parseDockerLikeEnvironmentVariables';
import { AppleContainerPublishedPortSchema, normalizeAppleContainerPublishedPorts } from './AppleContainerPublishedPort';

const AppleContainerStatusNetworkSchema = z.object({
    network: z.optional(z.string()),
    ipv4Address: z.optional(z.string()),
    ipv4Gateway: z.optional(z.string()),
    macAddress: z.optional(z.string()),
});

/**
 * `configuration.mounts[]` -- a volume mount reports its volume name under
 * `type.volume.name` (the sibling top-level `source` is the host-side backing file, not usable
 * as a `--mount source=` value); anything else (confirmed: a bind mount reports `type.virtiofs:
 * {}`) is treated as a bind mount using the top-level `source` path. `readOnly` isn't a
 * dedicated field -- a `readonly` mount adds `"ro"` to `options` (confirmed against a real
 * `--mount ...,readonly` bind mount).
 */
const AppleContainerMountSchema = z.object({
    destination: z.optional(z.string()),
    source: z.optional(z.string()),
    options: z.optional(z.array(z.string())),
    type: z.optional(z.object({
        volume: z.optional(z.object({
            name: z.optional(z.string()),
        })),
    })),
});

function normalizeAppleContainerMounts(mounts: Array<z.infer<typeof AppleContainerMountSchema>> | undefined): Array<InspectContainersItemMount> {
    return (mounts ?? [])
        .filter((mount): mount is typeof mount & { destination: string } => !!mount.destination)
        .map((mount) => {
            const readOnly = (mount.options ?? []).includes('ro');
            const volumeName = mount.type?.volume?.name;

            return volumeName
                ? { type: 'volume' as const, source: volumeName, destination: mount.destination, readOnly }
                : { type: 'bind' as const, source: mount.source ?? '', destination: mount.destination, readOnly };
        });
}

/**
 * `container inspect <id>` emits the same nested shape as `container list` (see
 * `AppleContainerListContainerRecord.ts`), with the full `initProcess` and richer
 * `status.networks` entries added. No `--format` flag exists for this command -- confirmed:
 * `container inspect --format json <id>` errors with "Unknown option '--format'"; JSON is the
 * only output this command produces. The verb is also bare `inspect`, not `container inspect`.
 */
export const AppleContainerInspectContainerRecordSchema = z.object({
    id: z.string(),
    configuration: z.object({
        creationDate: z.optional(dateStringWithFallbackSchema),
        image: z.object({
            descriptor: z.optional(z.object({
                digest: z.optional(z.string()),
            })),
            reference: z.optional(z.string()),
        }),
        initProcess: z.optional(z.object({
            executable: z.optional(z.string()),
            arguments: z.optional(z.array(z.string())),
            environment: z.optional(z.array(z.string())),
            workingDirectory: z.optional(z.string()),
        })),
        labels: z.optional(z.record(z.string(), z.string())),
        mounts: z.optional(z.array(AppleContainerMountSchema)),
        publishedPorts: z.optional(z.array(AppleContainerPublishedPortSchema)),
    }),
    status: z.object({
        startedDate: z.optional(dateStringWithFallbackSchema),
        networks: z.optional(z.array(AppleContainerStatusNetworkSchema)),
    }),
});

export type AppleContainerInspectContainerRecord = z.infer<typeof AppleContainerInspectContainerRecordSchema>;

/**
 * Normalize a parsed {@link AppleContainerInspectContainerRecord} to the common
 * {@link InspectContainersItem}.
 */
export function normalizeAppleContainerInspectContainerRecord(container: AppleContainerInspectContainerRecord, raw: string): InspectContainersItem {
    const initProcess = container.configuration.initProcess;
    const networks: InspectContainersItemNetwork[] = (container.status.networks ?? [])
        .filter((network): network is typeof network & { network: string } => !!network.network)
        .map((network) => ({
            name: network.network,
            gateway: network.ipv4Gateway,
            ipAddress: network.ipv4Address,
            macAddress: network.macAddress,
        }));

    return {
        id: container.id,
        // The `container` CLI has no name distinct from the container's ID; see the same note
        // in AppleContainerListContainerRecord.ts.
        name: container.id,
        // Kept in the same `sha256:<digest>` form as SharedInspectContainerRecord -- consumers
        // (ImageTreeItem, ContainerTreeItem, askCopilot) slice this assuming that prefix.
        imageId: container.configuration.image.descriptor?.digest ?? '',
        image: parseDockerLikeImageName(container.configuration.image.reference),
        isolation: undefined,
        status: undefined,
        environmentVariables: parseDockerLikeEnvironmentVariables(initProcess?.environment ?? []),
        networks,
        ipAddress: networks[0]?.ipAddress,
        operatingSystem: 'linux',
        ports: normalizeAppleContainerPublishedPorts(container.configuration.publishedPorts),
        mounts: normalizeAppleContainerMounts(container.configuration.mounts),
        labels: container.configuration.labels ?? {},
        // Apple Container has no separate entrypoint/cmd split in inspect output -- only the
        // fully resolved init process (executable + arguments) is reported.
        entrypoint: [],
        command: initProcess?.executable ? [initProcess.executable, ...(initProcess.arguments ?? [])] : [],
        currentDirectory: initProcess?.workingDirectory,
        createdAt: container.configuration.creationDate ?? new Date(0),
        startedAt: container.status.startedDate,
        finishedAt: undefined,
        raw,
    };
}
