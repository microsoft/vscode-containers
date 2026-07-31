/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toArray } from '@microsoft/vscode-processutils';
import * as z from 'zod/mini';
import type { ImageNameInfo, InspectImagesItem, PortBinding } from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { parseDockerLikeEnvironmentVariables } from '../DockerClientBase/parseDockerLikeEnvironmentVariables';

const WslcInspectImageConfigSchema = z.object({
    Entrypoint: z.optional(z.union([z.array(z.string()), z.string(), z.null()])),
    Cmd: z.optional(z.union([z.array(z.string()), z.string(), z.null()])),
    Env: z.nullish(z.array(z.string())),
    Labels: z.nullish(z.record(z.string(), z.string())),
    ExposedPorts: z.nullish(z.record(z.string(), z.unknown())),
    Volumes: z.nullish(z.record(z.string(), z.unknown())),
    WorkingDir: z.nullish(z.string()),
    User: z.nullish(z.string()),
});

export const WslcInspectImageRecordSchema = z.object({
    Id: z.string(),
    RepoTags: z.nullish(z.array(z.string())),
    RepoDigests: z.nullish(z.array(z.string())),
    Config: z.optional(WslcInspectImageConfigSchema),
    Architecture: z.optional(z.string()),
    Os: z.optional(z.string()),
    Created: z.nullish(z.string()),
    Size: z.optional(z.number()),
});

type WslcInspectImageRecord = z.infer<typeof WslcInspectImageRecordSchema>;

export function normalizeWslcInspectImageRecord(image: WslcInspectImageRecord, raw: string): InspectImagesItem {
    const imageNameInfo: ImageNameInfo = parseDockerLikeImageName(image.RepoTags?.[0]);

    const environmentVariables = parseDockerLikeEnvironmentVariables(image.Config?.Env ?? []);

    const ports = Object.entries(image.Config?.ExposedPorts ?? {}).map<PortBinding>(([rawPort]) => {
        const [port, protocol] = rawPort.split('/');
        return {
            containerPort: parseInt(port, 10),
            protocol: protocol?.toLowerCase() === 'tcp' ? 'tcp' : protocol?.toLowerCase() === 'udp' ? 'udp' : undefined,
        };
    });

    const volumes = Object.entries(image.Config?.Volumes ?? {}).map<string>(([rawVolume]) => rawVolume);

    const labels = image.Config?.Labels ?? {};

    const architecture = image.Architecture?.toLowerCase() === 'amd64'
        ? 'amd64'
        : image.Architecture?.toLowerCase() === 'arm64' ? 'arm64' : undefined;

    const os = image.Os?.toLowerCase() === 'linux'
        ? 'linux'
        : image.Os?.toLowerCase() === 'windows'
            ? 'windows'
            : undefined;

    const repoDigests = image.RepoDigests ?? [];
    const isLocalImage = !repoDigests.some((digest) => !digest.toLowerCase().startsWith('localhost/'));

    return {
        id: image.Id,
        image: imageNameInfo,
        repoDigests,
        isLocalImage,
        environmentVariables,
        ports,
        volumes,
        labels,
        entrypoint: toArray(image.Config?.Entrypoint ?? []),
        command: toArray(image.Config?.Cmd ?? []),
        currentDirectory: image.Config?.WorkingDir || undefined,
        architecture,
        operatingSystem: os,
        createdAt: image.Created ? dayjs(image.Created).toDate() : undefined,
        user: image.Config?.User || undefined,
        raw,
    };
}
