/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toArray } from '@microsoft/vscode-processutils';
import * as z from 'zod/mini';
import { InspectContainersItem, InspectContainersItemBindMount, InspectContainersItemMount, InspectContainersItemNetwork, InspectContainersItemVolumeMount, PortBinding } from '../../contracts/ContainerClient';
import { dateStringSchema } from '../../contracts/ZodTransforms';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { normalizeIpAddress } from '../DockerClientBase/normalizeIpAddress';
import { parseDockerLikeEnvironmentVariables } from '../DockerClientBase/parseDockerLikeEnvironmentVariables';

// Nerdctl (nerdctl) inspect container output - Docker-compatible format
const NerdctlInspectContainerPortHostSchema = z.object({
    HostIp: z.optional(z.string()),
    HostPort: z.optional(z.string()),
});

const NerdctlInspectContainerBindMountSchema = z.object({
    Type: z.literal('bind'),
    Source: z.string(),
    Destination: z.string(),
    RW: z.optional(z.boolean()),
});

const NerdctlInspectContainerVolumeMountSchema = z.object({
    Type: z.literal('volume'),
    Name: z.string(),
    Source: z.string(),
    Destination: z.string(),
    Driver: z.optional(z.string()),
    RW: z.optional(z.boolean()),
});

const NerdctlInspectContainerMountSchema = z.catch(z.nullable(z.union([
    NerdctlInspectContainerBindMountSchema,
    NerdctlInspectContainerVolumeMountSchema,
])), null); // tmpfs/npipe or otherwise-unrecognized mounts become null instead of failing the whole container inspect

const NerdctlInspectNetworkSchema = z.object({
    Gateway: z.optional(z.string()),
    IPAddress: z.optional(z.string()),
    MacAddress: z.optional(z.string()),
});

const NerdctlInspectContainerConfigSchema = z.object({
    Image: z.optional(z.string()), // May not be present in all nerdctl versions
    Entrypoint: z.optional(z.union([z.array(z.string()), z.string(), z.null()])),
    Cmd: z.optional(z.union([z.array(z.string()), z.string(), z.null()])),
    Env: z.optional(z.nullable(z.array(z.string()))),
    Labels: z.optional(z.nullable(z.record(z.string(), z.string()))),
    WorkingDir: z.optional(z.nullable(z.string())),
});

const NerdctlInspectContainerHostConfigSchema = z.object({
    PublishAllPorts: z.optional(z.nullable(z.boolean())),
    Isolation: z.optional(z.string()),
});

const NerdctlInspectContainerNetworkSettingsSchema = z.object({
    Networks: z.optional(z.nullable(z.record(z.string(), NerdctlInspectNetworkSchema))),
    IPAddress: z.optional(z.string()),
    Ports: z.optional(z.nullable(z.record(z.string(), z.nullable(z.array(NerdctlInspectContainerPortHostSchema))))),
});

const NerdctlInspectContainerStateSchema = z.object({
    Status: z.optional(z.string()),
    // Date strings transformed to Date objects
    StartedAt: z.optional(dateStringSchema),
    FinishedAt: z.optional(dateStringSchema),
});

export const NerdctlInspectContainerRecordSchema = z.object({
    Id: z.string(),
    Name: z.string(),
    Image: z.string(),
    // Date string transformed to Date object
    Created: dateStringSchema,
    Mounts: z.optional(z.array(NerdctlInspectContainerMountSchema)),
    State: z.optional(NerdctlInspectContainerStateSchema),
    Config: z.optional(NerdctlInspectContainerConfigSchema),
    HostConfig: z.optional(NerdctlInspectContainerHostConfigSchema),
    NetworkSettings: z.optional(NerdctlInspectContainerNetworkSettingsSchema),
});

type NerdctlInspectContainerRecord = z.infer<typeof NerdctlInspectContainerRecordSchema>;

export function normalizeNerdctlInspectContainerRecord(container: NerdctlInspectContainerRecord, raw: string): InspectContainersItem {
    const environmentVariables = parseDockerLikeEnvironmentVariables(container.Config?.Env ?? []);

    const networks = Object.entries(container.NetworkSettings?.Networks ?? {}).map<InspectContainersItemNetwork>(([name, network]) => {
        return {
            name,
            gateway: network.Gateway || undefined,
            ipAddress: normalizeIpAddress(network.IPAddress),
            macAddress: network.MacAddress || undefined,
        };
    });

    const ports = Object.entries(container.NetworkSettings?.Ports ?? {})
        .map<PortBinding | null>(([rawPort, hostBinding]) => {
            const [port, protocol] = rawPort.split('/');
            const containerPort = parseInt(port, 10);
            // Skip entries with invalid container port
            if (!Number.isFinite(containerPort)) {
                return null;
            }
            const hostPortParsed = hostBinding?.[0]?.HostPort ? parseInt(hostBinding[0].HostPort, 10) : undefined;
            // Only include hostPort if it's a valid number
            const hostPort = hostPortParsed !== undefined && Number.isFinite(hostPortParsed) ? hostPortParsed : undefined;
            return {
                hostIp: normalizeIpAddress(hostBinding?.[0]?.HostIp),
                hostPort,
                containerPort,
                protocol: protocol?.toLowerCase() === 'tcp'
                    ? 'tcp'
                    : protocol?.toLowerCase() === 'udp'
                        ? 'udp'
                        : undefined,
            };
        })
        .filter((port): port is PortBinding => port !== null);

    const mounts = (container.Mounts ?? []).reduce<Array<InspectContainersItemMount>>((curMounts, mount) => {
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
                    driver: mount.Driver || 'local',
                    readOnly: mount.RW === false,
                } satisfies InspectContainersItemVolumeMount];
            default:
                // Skip unknown mount types (e.g., tmpfs, npipe)
                return curMounts;
        }
    }, []);

    const labels = container.Config?.Labels ?? {};

    // Dates are already parsed by the schema transforms
    const createdAt = container.Created ?? new Date();
    const startedAt = container.State?.StartedAt;
    const finishedAt = container.State?.FinishedAt;

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
        // Only include startedAt/finishedAt if they are after or same as createdAt
        startedAt: startedAt && startedAt >= createdAt ? startedAt : undefined,
        finishedAt: finishedAt && finishedAt >= createdAt ? finishedAt : undefined,
        raw,
    };
}
