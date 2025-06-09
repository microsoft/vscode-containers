/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod/v4';
import { ImageNameInfo, InspectImagesItem, PortBinding } from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { toArray } from '../../utils/toArray';
import { parseDockerLikeEnvironmentVariables } from '../DockerClientBase/parseDockerLikeEnvironmentVariables';

const PodmanInspectImageConfigSchema = z.object({
    Entrypoint: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
    Cmd: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
    Env: z.array(z.string()).optional(),
    ExposedPorts: z.record(z.string(), z.unknown()).nullable().optional(),
    Volumes: z.record(z.string(), z.unknown()).nullable().optional(),
    WorkingDir: z.string().nullable().optional(),
    User: z.string().nullable().optional(),
});

export const PodmanInspectImageRecordSchema = z.object({
    Id: z.string(),
    RepoTags: z.array(z.string()),
    Config: PodmanInspectImageConfigSchema,
    RepoDigests: z.array(z.string()),
    Architecture: z.string(),
    Os: z.string(),
    Labels: z.record(z.string(), z.string()).nullable(),
    Created: z.string(),
    User: z.string().optional(),
});

type PodmanInspectImageRecord = z.infer<typeof PodmanInspectImageRecordSchema>;

export function normalizePodmanInspectImageRecord(image: PodmanInspectImageRecord, raw: string): InspectImagesItem {
    // This is effectively doing firstOrDefault on the RepoTags for the image. If there are any values
    // in RepoTags, the first one will be parsed and returned as the tag name for the image.
    const imageNameInfo: ImageNameInfo = parseDockerLikeImageName(image.RepoTags?.[0]);

    // Parse any environment variables defined for the image
    const environmentVariables = parseDockerLikeEnvironmentVariables(image.Config?.Env || []);

    // Parse any default ports exposed by the image
    const ports = Object.entries(image.Config?.ExposedPorts || {}).map<PortBinding>(([rawPort]) => {
        const [port, protocol] = rawPort.split('/');
        return {
            containerPort: parseInt(port),
            protocol: protocol.toLowerCase() === 'tcp' ? 'tcp' : protocol.toLowerCase() === 'udp' ? 'udp' : undefined,
        };
    });

    // Parse any default volumes specified by the image
    const volumes = Object.entries(image.Config?.Volumes || {}).map<string>(([rawVolume]) => rawVolume);

    // Parse any labels assigned to the image
    const labels = image.Labels ?? {};

    // Parse and normalize the image architecture
    const architecture = image.Architecture?.toLowerCase() === 'amd64'
        ? 'amd64'
        : image.Architecture?.toLowerCase() === 'arm64' ? 'arm64' : undefined;

    // Parse and normalize the image OS
    const os = image.Os?.toLowerCase() === 'linux'
        ? 'linux'
        : image.Architecture?.toLowerCase() === 'windows'
            ? 'windows'
            : undefined;

    // Determine if the image has been pushed to a remote repo
    // (no repo digests or only localhost/ repo digests)
    const isLocalImage = !(image.RepoDigests || []).some((digest) => !digest.toLowerCase().startsWith('localhost/'));

    return {
        id: image.Id,
        image: imageNameInfo,
        repoDigests: image.RepoDigests,
        isLocalImage,
        environmentVariables,
        ports,
        volumes,
        labels,
        entrypoint: toArray(image.Config?.Entrypoint || []),
        command: toArray(image.Config?.Cmd || []),
        currentDirectory: image.Config?.WorkingDir || undefined,
        architecture,
        operatingSystem: os,
        createdAt: dayjs(image.Created).toDate(),
        user: image?.User || undefined,
        raw,
    };
}
