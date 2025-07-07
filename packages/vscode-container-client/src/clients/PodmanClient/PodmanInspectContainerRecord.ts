/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';
import { InspectContainersItem, InspectContainersItemBindMount, InspectContainersItemMount, InspectContainersItemNetwork, InspectContainersItemVolumeMount, PortBinding } from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { toArray } from '../../utils/toArray';
import { parseDockerLikeEnvironmentVariables } from '../DockerClientBase/parseDockerLikeEnvironmentVariables';

const PodmanInspectContainerPortHostSchema = z.object({
    HostIp: z.string().optional(),
    HostPort: z.string().optional(),
});

const PodmanInspectContainerBindMountSchema = z.object({
    Type: z.literal('bind'),
    Source: z.string(),
    Destination: z.string(),
    RW: z.boolean(),
});

const PodmanInspectContainerVolumeMountSchema = z.object({
    Type: z.literal('volume'),
    Name: z.string(),
    Source: z.string(),
    Destination: z.string(),
    Driver: z.string(),
    RW: z.boolean(),
});

const PodmanInspectContainerMountSchema = z.union([
    PodmanInspectContainerBindMountSchema,
    PodmanInspectContainerVolumeMountSchema,
]);

const PodmanInspectNetworkSchema = z.object({
    Gateway: z.string(),
    IPAddress: z.string(),
    MacAddress: z.string(),
});

const PodmanInspectContainerConfigSchema = z.object({
    Image: z.string(),
    Entrypoint: z.union([z.array(z.string()), z.string(), z.null()]),
    Cmd: z.union([z.array(z.string()), z.string(), z.null()]),
    Env: z.array(z.string()).nullable().optional(),
    Labels: z.record(z.string(), z.string()).nullable().optional(),
    WorkingDir: z.string().nullable().optional(),
});

const PodmanInspectContainerHostConfigSchema = z.object({
    PublishAllPorts: z.boolean().nullable().optional(),
    Isolation: z.string().optional(),
});

const PodmanInspectContainerNetworkSettingsSchema = z.object({
    Networks: z.record(z.string(), PodmanInspectNetworkSchema).nullable().optional(),
    IPAddress: z.string().optional(),
    Ports: z.record(z.string(), z.array(PodmanInspectContainerPortHostSchema)).nullable().optional(),
});

const PodmanInspectContainerStateSchema = z.object({
    Status: z.string().optional(),
    StartedAt: z.string().optional(),
    FinishedAt: z.string().optional(),
});

export const PodmanInspectContainerRecordSchema = z.object({
    Id: z.string(),
    Name: z.string(),
    Image: z.string(),
    Created: z.string(),
    Mounts: z.array(PodmanInspectContainerMountSchema),
    State: PodmanInspectContainerStateSchema,
    Config: PodmanInspectContainerConfigSchema,
    HostConfig: PodmanInspectContainerHostConfigSchema,
    NetworkSettings: PodmanInspectContainerNetworkSettingsSchema,
});

type PodmanInspectContainerRecord = z.infer<typeof PodmanInspectContainerRecordSchema>;

export function normalizePodmanInspectContainerRecord(container: PodmanInspectContainerRecord, raw: string): InspectContainersItem {
    // Parse the environment variables assigned to the container at runtime
    const environmentVariables = parseDockerLikeEnvironmentVariables(container.Config?.Env || []);

    // Parse the networks assigned to the container and normalize to InspectContainersItemNetwork
    // records
    const networks = Object.entries(container.NetworkSettings?.Networks || {}).map<InspectContainersItemNetwork>(([name, dockerNetwork]) => {
        return {
            name,
            gateway: dockerNetwork.Gateway || undefined,
            ipAddress: dockerNetwork.IPAddress || undefined,
            macAddress: dockerNetwork.MacAddress || undefined,
        } satisfies InspectContainersItemNetwork;
    });

    // Parse the exposed ports for the container and normalize to a PortBinding record
    const ports = Object.entries(container.NetworkSettings?.Ports || {}).map<PortBinding>(([rawPort, hostBinding]) => {
        const [port, protocol] = rawPort.split('/');
        return {
            hostIp: hostBinding?.[0]?.HostIp,
            hostPort: hostBinding?.[0]?.HostPort ? parseInt(hostBinding[0].HostPort) : undefined,
            containerPort: parseInt(port),
            protocol: protocol.toLowerCase() === 'tcp'
                ? 'tcp'
                : protocol.toLowerCase() === 'udp'
                    ? 'udp'
                    : undefined,
        } satisfies PortBinding;
    });

    // Parse the volume and bind mounts associated with the given runtime and normalize to
    // InspectContainersItemMount records
    const mounts = (container.Mounts || []).reduce<Array<InspectContainersItemMount>>((curMounts, mount) => {
        switch (mount?.Type) {
            case 'bind':
                return [...curMounts, {
                    type: 'bind',
                    source: mount.Source,
                    destination: mount.Destination,
                    readOnly: !mount.RW,
                } satisfies InspectContainersItemBindMount];
            case 'volume':
                return [...curMounts, {
                    type: 'volume',
                    source: mount.Name,
                    destination: mount.Destination,
                    driver: mount.Driver,
                    readOnly: !mount.RW,
                } satisfies InspectContainersItemVolumeMount];
        }

    }, new Array<InspectContainersItemMount>());
    const labels = container.Config?.Labels ?? {};

    const createdAt = dayjs.utc(container.Created);
    const startedAt = container.State?.StartedAt
        ? dayjs.utc(container.State?.StartedAt)
        : undefined;
    const finishedAt = container.State?.FinishedAt
        ? dayjs.utc(container.State?.FinishedAt)
        : undefined;

    // Return the normalized InspectContainersItem record
    return {
        id: container.Id,
        name: container.Name,
        imageId: container.Image,
        image: parseDockerLikeImageName(container.Config.Image),
        isolation: container.HostConfig?.Isolation,
        status: container.State?.Status,
        environmentVariables,
        networks,
        ipAddress: container.NetworkSettings?.IPAddress ? container.NetworkSettings?.IPAddress : undefined,
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
