/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toArray } from '@microsoft/vscode-processutils';
import * as z from 'zod/mini';
import type { ImageNameInfo, InspectImagesItem, PortBinding } from '../../contracts/ContainerClient';
import { architectureStringSchema, dateStringSchema, osTypeStringSchema } from '../../contracts/ZodTransforms';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { parseDockerLikeEnvironmentVariables } from '../DockerClientBase/parseDockerLikeEnvironmentVariables';

// Nerdctl (nerdctl) inspect image output - similar to Docker with some optional fields
const NerdctlInspectImageConfigSchema = z.object({
    Entrypoint: z.optional(z.union([z.array(z.string()), z.string(), z.null()])),
    Cmd: z.optional(z.union([z.array(z.string()), z.string(), z.null()])),
    Env: z.nullable(z.optional(z.array(z.string()))),
    Labels: z.optional(z.nullable(z.record(z.string(), z.string()))),
    ExposedPorts: z.optional(z.nullable(z.record(z.string(), z.unknown()))),
    Volumes: z.optional(z.nullable(z.record(z.string(), z.unknown()))),
    WorkingDir: z.optional(z.nullable(z.string())),
    User: z.optional(z.nullable(z.string())),
});

/**
 * Nerdctl inspect image schema with transforms for dates, architecture, and OS.
 */
export const NerdctlInspectImageRecordSchema = z.object({
    Id: z.string(),
    RepoTags: z.nullable(z.optional(z.array(z.string()))),
    Config: z.optional(NerdctlInspectImageConfigSchema),
    RepoDigests: z.nullable(z.optional(z.array(z.string()))),
    // Architecture normalized to 'amd64' | 'arm64' | undefined
    Architecture: z.optional(architectureStringSchema),
    // OS normalized to 'linux' | 'windows' | undefined
    Os: z.optional(osTypeStringSchema),
    // Date string transformed to Date object
    Created: z.optional(z.nullable(dateStringSchema)),
    User: z.optional(z.string()),
});

export type NerdctlInspectImageRecord = z.infer<typeof NerdctlInspectImageRecordSchema>;

/**
 * Normalize a parsed NerdctlInspectImageRecord to the common InspectImagesItem format.
 * Many transformations are already done by the schema.
 */
export function normalizeNerdctlInspectImageRecord(image: NerdctlInspectImageRecord, raw: string): InspectImagesItem {
    const imageNameInfo: ImageNameInfo = parseDockerLikeImageName(image.RepoTags?.[0]);

    const environmentVariables = parseDockerLikeEnvironmentVariables(image.Config?.Env ?? []);

    const ports = Object.entries(image.Config?.ExposedPorts ?? {})
        .map<PortBinding | null>(([rawPort]) => {
            const [port, protocol] = rawPort.split('/');
            const containerPort = parseInt(port, 10);
            // Skip entries where port parsing fails
            if (!Number.isFinite(containerPort)) {
                return null;
            }
            return {
                containerPort,
                protocol: protocol?.toLowerCase() === 'tcp' ? 'tcp' : protocol?.toLowerCase() === 'udp' ? 'udp' : undefined,
            };
        })
        .filter((port): port is PortBinding => port !== null);

    const volumes = Object.entries(image.Config?.Volumes ?? {}).map<string>(([rawVolume]) => rawVolume);

    const labels = image.Config?.Labels ?? {};

    const isLocalImage = !(image.RepoDigests ?? []).some((digest) => !digest.toLowerCase().startsWith('localhost/'));

    return {
        id: image.Id,
        image: imageNameInfo,
        repoDigests: image.RepoDigests ?? [],
        isLocalImage,
        environmentVariables,
        ports,
        volumes,
        labels,
        entrypoint: toArray(image.Config?.Entrypoint || []),
        command: toArray(image.Config?.Cmd || []),
        currentDirectory: image.Config?.WorkingDir || undefined,
        // Architecture and OS are already normalized by the schema
        architecture: image.Architecture,
        operatingSystem: image.Os,
        // Date is already parsed by the schema
        createdAt: image.Created ?? undefined,
        // Prefer Config.User but fall back to top-level User if not present
        user: image.Config?.User ?? image.User ?? undefined,
        raw,
    };
}
