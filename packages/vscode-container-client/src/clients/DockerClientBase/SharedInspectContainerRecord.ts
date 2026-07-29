/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toArray } from '@microsoft/vscode-processutils';
import * as z from 'zod/mini';
import type { InspectContainersItem, InspectContainersItemBindMount, InspectContainersItemMount, InspectContainersItemNetwork, InspectContainersItemVolumeMount, PortBinding } from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { normalizeIpAddress } from './normalizeIpAddress';
import { parseDockerLikeEnvironmentVariables } from './parseDockerLikeEnvironmentVariables';
import { parseExposedPortKey } from './parseDockerRawPortString';
import { resolveCreatedAtBaseline } from './resolveCreatedAt';

/**
 * A single, tolerant schema for the Docker-compatible `inspect` output emitted
 * by Docker, Podman, and nerdctl. Every field that any of the three runtimes may
 * omit is modeled as optional/nullable so that the strict Docker output remains a
 * subset of this shape. Unrecognized mount types (e.g. `tmpfs`, `npipe`) are
 * coerced to `null` via {@link z.catch} so a single odd mount does not fail the
 * whole container inspect.
 */

const InspectContainerPortHostSchema = z.object({
    HostIp: z.optional(z.string()),
    HostPort: z.optional(z.string()),
});

const InspectContainerBindMountSchema = z.object({
    Type: z.literal('bind'),
    Source: z.string(),
    Destination: z.string(),
    RW: z.optional(z.boolean()),
});

const InspectContainerVolumeMountSchema = z.object({
    Type: z.literal('volume'),
    Name: z.string(),
    Source: z.string(),
    Destination: z.string(),
    Driver: z.optional(z.string()),
    RW: z.optional(z.boolean()),
});

const InspectContainerMountSchema = z.catch(z.nullable(z.union([
    InspectContainerBindMountSchema,
    InspectContainerVolumeMountSchema,
])), null); // tmpfs/npipe or otherwise-unrecognized mounts become null instead of failing the whole container inspect

type InspectContainerMount = z.infer<typeof InspectContainerMountSchema>;

const InspectContainerNetworkSchema = z.object({
    Gateway: z.optional(z.string()),
    IPAddress: z.optional(z.string()),
    MacAddress: z.optional(z.string()),
});

const InspectContainerConfigSchema = z.object({
    Image: z.optional(z.string()),
    Entrypoint: z.optional(z.union([z.array(z.string()), z.string(), z.null()])),
    Cmd: z.optional(z.union([z.array(z.string()), z.string(), z.null()])),
    Env: z.optional(z.nullable(z.array(z.string()))),
    Labels: z.optional(z.nullable(z.record(z.string(), z.string()))),
    WorkingDir: z.optional(z.nullable(z.string())),
});

const InspectContainerHostConfigSchema = z.object({
    PublishAllPorts: z.optional(z.nullable(z.boolean())),
    Isolation: z.optional(z.string()),
});

const InspectContainerNetworkSettingsSchema = z.object({
    Networks: z.optional(z.nullable(z.record(z.string(), InspectContainerNetworkSchema))),
    IPAddress: z.optional(z.string()),
    Ports: z.optional(z.nullable(z.record(z.string(), z.nullable(z.array(InspectContainerPortHostSchema))))),
});

const InspectContainerStateSchema = z.object({
    Status: z.optional(z.string()),
    StartedAt: z.optional(z.string()),
    FinishedAt: z.optional(z.string()),
});

export const SharedInspectContainerRecordSchema = z.object({
    Id: z.string(),
    Name: z.string(),
    Image: z.string(),
    Platform: z.optional(z.string()),
    Created: z.optional(z.string()),
    Mounts: z.optional(z.array(InspectContainerMountSchema)),
    State: z.optional(InspectContainerStateSchema),
    Config: z.optional(InspectContainerConfigSchema),
    HostConfig: z.optional(InspectContainerHostConfigSchema),
    NetworkSettings: z.optional(InspectContainerNetworkSettingsSchema),
});

export type SharedInspectContainerRecord = z.infer<typeof SharedInspectContainerRecordSchema>;

/**
 * Small per-runtime knobs that capture the intentional differences between the
 * otherwise-identical Docker/Podman/nerdctl inspect normalizers.
 */
export interface NormalizeInspectContainerOptions {
    /**
     * Fallback driver for volume mounts that omit a `Driver` (nerdctl). Docker
     * and Podman always emit a driver, so they leave this unset.
     */
    defaultVolumeDriver?: string;
}

function normalizeMounts(mounts: ReadonlyArray<InspectContainerMount>, options: NormalizeInspectContainerOptions): InspectContainersItemMount[] {
    return mounts.reduce<Array<InspectContainersItemMount>>((curMounts, mount) => {
        switch (mount?.Type) {
            case 'bind':
                return [...curMounts, {
                    type: 'bind',
                    source: mount.Source,
                    destination: mount.Destination,
                    readOnly: mount.RW === false,
                } satisfies InspectContainersItemBindMount];
            case 'volume':
                return [...curMounts, {
                    type: 'volume',
                    source: mount.Name,
                    destination: mount.Destination,
                    driver: mount.Driver || options.defaultVolumeDriver || '',
                    readOnly: mount.RW === false,
                } satisfies InspectContainersItemVolumeMount];
            default:
                // Skip unknown/unrecognized mount types (e.g. tmpfs, npipe)
                return curMounts;
        }
    }, []);
}

/**
 * Normalize a parsed {@link SharedInspectContainerRecord} to the common
 * {@link InspectContainersItem}. Behavior is identical across runtimes except
 * for the knobs described by {@link NormalizeInspectContainerOptions}.
 */
export function normalizeInspectContainerRecord(container: SharedInspectContainerRecord, raw: string, options: NormalizeInspectContainerOptions = {}): InspectContainersItem {
    // Parse the environment variables assigned to the container at runtime
    const environmentVariables = parseDockerLikeEnvironmentVariables(container.Config?.Env ?? []);

    // Parse the networks assigned to the container and normalize to InspectContainersItemNetwork records
    const networks = Object.entries(container.NetworkSettings?.Networks ?? {}).map<InspectContainersItemNetwork>(([name, network]) => {
        return {
            name,
            gateway: network.Gateway || undefined,
            ipAddress: normalizeIpAddress(network.IPAddress),
            macAddress: network.MacAddress || undefined,
        } satisfies InspectContainersItemNetwork;
    });

    // Parse the exposed ports for the container and normalize to PortBinding records
    const ports = Object.entries(container.NetworkSettings?.Ports ?? {})
        .map<PortBinding | null>(([rawPort, hostBinding]) => {
            const parsedKey = parseExposedPortKey(rawPort);
            if (!parsedKey) {
                return null;
            }
            const hostPortParsed = hostBinding?.[0]?.HostPort ? parseInt(hostBinding[0].HostPort, 10) : undefined;
            const hostPort = hostPortParsed !== undefined && Number.isFinite(hostPortParsed) ? hostPortParsed : undefined;
            return {
                hostIp: normalizeIpAddress(hostBinding?.[0]?.HostIp),
                hostPort,
                containerPort: parsedKey.containerPort,
                protocol: parsedKey.protocol,
            } satisfies PortBinding;
        })
        .filter((port): port is PortBinding => port !== null);

    // Parse the volume and bind mounts and normalize to InspectContainersItemMount records
    const mounts = normalizeMounts(container.Mounts ?? [], options);

    const labels = container.Config?.Labels ?? {};

    const createdBaseline = resolveCreatedAtBaseline(container.Created);
    const createdAt = createdBaseline.toDate();

    const startedDayjs = container.State?.StartedAt ? dayjs.utc(container.State.StartedAt) : undefined;
    const finishedDayjs = container.State?.FinishedAt ? dayjs.utc(container.State.FinishedAt) : undefined;

    // Return the normalized InspectContainersItem record
    return {
        id: container.Id,
        name: container.Name,
        imageId: container.Image,
        image: parseDockerLikeImageName(container.Config?.Image || container.Image),
        isolation: container.HostConfig?.Isolation,
        status: container.State?.Status,
        environmentVariables,
        networks,
        ipAddress: normalizeIpAddress(container.NetworkSettings?.IPAddress),
        ports,
        mounts,
        labels,
        entrypoint: toArray(container.Config?.Entrypoint ?? []),
        command: toArray(container.Config?.Cmd ?? []),
        currentDirectory: container.Config?.WorkingDir || undefined,
        createdAt,
        // Only include startedAt/finishedAt if they are the same as or after createdAt
        startedAt: startedDayjs?.isValid() && !startedDayjs.isBefore(createdBaseline)
            ? startedDayjs.toDate()
            : undefined,
        finishedAt: finishedDayjs?.isValid() && !finishedDayjs.isBefore(createdBaseline)
            ? finishedDayjs.toDate()
            : undefined,
        raw,
    };
}
