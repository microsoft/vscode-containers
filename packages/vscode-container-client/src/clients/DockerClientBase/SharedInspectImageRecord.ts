/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ImageNameInfo, InspectImagesItem, PortBinding } from '../../contracts/ContainerClient';
import { architectureStringSchema, dateStringSchema, osTypeStringSchema, stringArraySchema } from '../../contracts/ZodTransforms';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { parseDockerLikeEnvironmentVariables } from './parseDockerLikeEnvironmentVariables';
import { parseExposedPortKey } from './parseDockerRawPortString';

/**
 * A single, tolerant schema for the Docker-compatible image `inspect` output
 * emitted by Docker, Podman, and nerdctl. Every field that any of the three
 * runtimes may omit is modeled as optional/nullable so that the strict Docker
 * output remains a subset of this shape.
 *
 * `Architecture`, `Os`, and `Created` reuse the shared field transforms so the
 * schema does the normalization once for every runtime. This also corrects a
 * latent bug in the old Docker/Podman normalizers, which tested
 * `Architecture === 'windows'` (instead of `Os`) when detecting the operating
 * system, and did not recognize the `x86_64`/`aarch64` architecture aliases.
 */

const InspectImageConfigSchema = z.object({
    // Single string or array coalesced to string[] by the shared transform
    Entrypoint: stringArraySchema,
    Cmd: stringArraySchema,
    Env: z.optional(z.nullable(z.array(z.string()))),
    Labels: z.optional(z.nullable(z.record(z.string(), z.string()))),
    ExposedPorts: z.optional(z.nullable(z.record(z.string(), z.unknown()))),
    Volumes: z.optional(z.nullable(z.record(z.string(), z.unknown()))),
    WorkingDir: z.optional(z.nullable(z.string())),
    User: z.optional(z.nullable(z.string())),
});

export const SharedInspectImageRecordSchema = z.object({
    Id: z.string(),
    RepoTags: z.optional(z.nullable(z.array(z.string()))),
    Config: z.optional(InspectImageConfigSchema),
    RepoDigests: z.optional(z.nullable(z.array(z.string()))),
    // Architecture normalized to 'amd64' | 'arm64' | undefined
    Architecture: z.optional(architectureStringSchema),
    // OS normalized to 'linux' | 'windows' | undefined
    Os: z.optional(osTypeStringSchema),
    // Some runtimes (Podman) surface labels at the top level rather than under Config
    Labels: z.optional(z.nullable(z.record(z.string(), z.string()))),
    // Date string transformed to Date | undefined
    Created: z.optional(z.nullable(dateStringSchema)),
    User: z.optional(z.string()),
});

export type SharedInspectImageRecord = z.infer<typeof SharedInspectImageRecordSchema>;

/**
 * Normalize a parsed {@link SharedInspectImageRecord} to the common
 * {@link InspectImagesItem}. Architecture, OS, and the creation date are already
 * normalized by the schema transforms.
 */
export function normalizeInspectImageRecord(image: SharedInspectImageRecord, raw: string): InspectImagesItem {
    // This is effectively doing firstOrDefault on the RepoTags for the image. If there are any values
    // in RepoTags, the first one will be parsed and returned as the tag name for the image.
    const imageNameInfo: ImageNameInfo = parseDockerLikeImageName(image.RepoTags?.[0]);

    // Parse any environment variables defined for the image
    const environmentVariables = parseDockerLikeEnvironmentVariables(image.Config?.Env ?? []);

    // Parse any default ports exposed by the image
    const ports = Object.entries(image.Config?.ExposedPorts ?? {})
        .map<PortBinding | undefined>(([rawPort]) => parseExposedPortKey(rawPort))
        .filter((port): port is PortBinding => port !== undefined);

    // Parse any default volumes specified by the image
    const volumes = Object.entries(image.Config?.Volumes ?? {}).map<string>(([rawVolume]) => rawVolume);

    // Parse any labels assigned to the image (Config.Labels for Docker/nerdctl, top-level Labels for Podman)
    const labels = image.Config?.Labels ?? image.Labels ?? {};

    // Determine if the image has been pushed to a remote repo
    // (no repo digests or only localhost/ repo digests)
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
        entrypoint: image.Config?.Entrypoint ?? [],
        command: image.Config?.Cmd ?? [],
        currentDirectory: image.Config?.WorkingDir || undefined,
        // Architecture and OS are already normalized by the schema
        architecture: image.Architecture,
        operatingSystem: image.Os,
        // Date is already parsed by the schema
        createdAt: image.Created ?? undefined,
        // Prefer Config.User but fall back to top-level User if not present
        user: image.Config?.User || image.User || undefined,
        raw,
    };
}
