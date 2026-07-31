/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toArray } from '@microsoft/vscode-processutils';
import * as z from 'zod/mini';
import type {
    InspectContainersItem,
    InspectContainersItemBindMount,
    InspectContainersItemMount,
    InspectContainersItemNetwork,
    InspectContainersItemVolumeMount,
    PortBinding,
} from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { normalizeIpAddress } from '../DockerClientBase/normalizeIpAddress';
import { parseDockerLikeEnvironmentVariables } from '../DockerClientBase/parseDockerLikeEnvironmentVariables';

const WslcInspectBindMountSchema = z.object({
    Type: z.literal('bind'),
    Source: z.string(),
    Destination: z.string(),
    ReadWrite: z.optional(z.boolean()),
});

const WslcInspectVolumeMountSchema = z.object({
    Type: z.literal('volume'),
    Name: z.optional(z.string()),
    Source: z.optional(z.string()),
    Destination: z.string(),
    Driver: z.optional(z.string()),
    ReadWrite: z.optional(z.boolean()),
});

const WslcInspectMountSchema = z.union([
    WslcInspectBindMountSchema,
    WslcInspectVolumeMountSchema,
]);

const WslcInspectNetworkSchema = z.object({
    Gateway: z.optional(z.string()),
    IPAddress: z.optional(z.string()),
    IPPrefixLen: z.optional(z.number()),
    MacAddress: z.optional(z.string()),
});

const WslcInspectPortHostSchema = z.object({
    HostIp: z.optional(z.string()),
    HostPort: z.optional(z.string()),
});

const WslcInspectConfigSchema = z.object({
    Image: z.optional(z.string()),
    Entrypoint: z.optional(z.union([z.array(z.string()), z.string(), z.null()])),
    Cmd: z.optional(z.union([z.array(z.string()), z.string(), z.null()])),
    Env: z.nullish(z.array(z.string())),
    Labels: z.nullish(z.record(z.string(), z.string())),
    WorkingDir: z.nullish(z.string()),
    User: z.nullish(z.string()),
});

const WslcInspectHostConfigSchema = z.object({
    NetworkMode: z.optional(z.string()),
    Isolation: z.optional(z.string()),
});

const WslcInspectNetworkSettingsSchema = z.object({
    Networks: z.nullish(z.record(z.string(), WslcInspectNetworkSchema)),
    IPAddress: z.optional(z.string()),
    Ports: z.nullish(z.record(z.string(), z.nullable(z.array(WslcInspectPortHostSchema)))),
});

const WslcInspectStateSchema = z.object({
    Status: z.optional(z.string()),
    Running: z.optional(z.boolean()),
    ExitCode: z.optional(z.number()),
    StartedAt: z.optional(z.string()),
    FinishedAt: z.optional(z.string()),
});

export const WslcInspectContainerRecordSchema = z.object({
    Id: z.string(),
    Name: z.string(),
    Image: z.optional(z.string()),
    Created: z.string(),
    Mounts: z.nullish(z.array(WslcInspectMountSchema)),
    Labels: z.nullish(z.record(z.string(), z.string())),
    State: z.optional(WslcInspectStateSchema),
    Config: WslcInspectConfigSchema,
    HostConfig: z.optional(WslcInspectHostConfigSchema),
    NetworkSettings: z.optional(WslcInspectNetworkSettingsSchema),
    Ports: z.nullish(z.record(z.string(), z.nullable(z.array(WslcInspectPortHostSchema)))),
});

type WslcInspectContainerRecord = z.infer<typeof WslcInspectContainerRecordSchema>;

export function normalizeWslcInspectContainerRecord(container: WslcInspectContainerRecord, raw: string): InspectContainersItem {
    const environmentVariables = parseDockerLikeEnvironmentVariables(container.Config?.Env ?? []);

    const networks = Object.entries(container.NetworkSettings?.Networks ?? {}).map<InspectContainersItemNetwork>(([name, network]) => {
        return {
            name,
            gateway: network.Gateway || undefined,
            ipAddress: normalizeIpAddress(network.IPAddress),
            macAddress: network.MacAddress || undefined,
        } satisfies InspectContainersItemNetwork;
    });

    // wslc emits Ports both at the root and on NetworkSettings; merge them so that
    // entries appearing only at one level are preserved. NetworkSettings wins on conflict.
    const portsSource: Record<string, ReadonlyArray<z.infer<typeof WslcInspectPortHostSchema>> | null | undefined> = {
        ...(container.Ports ?? {}),
        ...(container.NetworkSettings?.Ports ?? {}),
    };
    const ports = Object.entries(portsSource).map<PortBinding>(([rawPort, hostBinding]) => {
        const [port, protocol] = rawPort.split('/');
        return {
            hostIp: normalizeIpAddress(hostBinding?.[0]?.HostIp),
            hostPort: hostBinding?.[0]?.HostPort ? parseInt(hostBinding[0].HostPort, 10) : undefined,
            containerPort: parseInt(port, 10),
            protocol: protocol?.toLowerCase() === 'tcp'
                ? 'tcp'
                : protocol?.toLowerCase() === 'udp'
                    ? 'udp'
                    : undefined,
        } satisfies PortBinding;
    });

    const mounts = (container.Mounts ?? []).reduce<Array<InspectContainersItemMount>>((curMounts, mount) => {
        switch (mount?.Type) {
            case 'bind':
                return [...curMounts, {
                    type: 'bind',
                    source: mount.Source,
                    destination: mount.Destination,
                    readOnly: mount.ReadWrite === false,
                } satisfies InspectContainersItemBindMount];
            case 'volume':
                return [...curMounts, {
                    type: 'volume',
                    source: mount.Name ?? mount.Source ?? '',
                    destination: mount.Destination,
                    driver: mount.Driver ?? '',
                    readOnly: mount.ReadWrite === false,
                } satisfies InspectContainersItemVolumeMount];
        }

        return curMounts;
    }, new Array<InspectContainersItemMount>());

    const labels = container.Labels ?? container.Config?.Labels ?? {};

    const createdAt = dayjs.utc(container.Created);
    const startedAt = container.State?.StartedAt
        ? dayjs.utc(container.State.StartedAt)
        : undefined;
    const finishedAt = container.State?.FinishedAt
        ? dayjs.utc(container.State.FinishedAt)
        : undefined;

    return {
        id: container.Id,
        name: container.Name,
        imageId: container.Image ?? '',
        image: parseDockerLikeImageName(container.Config?.Image ?? container.Image),
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
        createdAt: createdAt.toDate(),
        startedAt: startedAt && (startedAt.isSame(createdAt) || startedAt.isAfter(createdAt))
            ? startedAt.toDate()
            : undefined,
        finishedAt: finishedAt && (finishedAt.isSame(createdAt) || finishedAt.isAfter(createdAt))
            ? finishedAt.toDate()
            : undefined,
        raw,
    };
}
