/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { InspectImagesItem } from '../../contracts/ContainerClient';
import { architectureStringSchema, dateStringWithFallbackSchema, osTypeStringSchema } from '../../contracts/ZodTransforms';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { parseDockerLikeEnvironmentVariables } from '../DockerClientBase/parseDockerLikeEnvironmentVariables';

const AppleContainerImageVariantConfigSchema = z.object({
    Cmd: z.optional(z.array(z.string())),
    Entrypoint: z.optional(z.array(z.string())),
    Env: z.optional(z.array(z.string())),
    WorkingDir: z.optional(z.string()),
    Labels: z.optional(z.record(z.string(), z.string())),
    User: z.optional(z.string()),
});

const AppleContainerInspectImageVariantSchema = z.object({
    platform: z.optional(z.object({
        architecture: z.optional(z.string()),
        os: z.optional(z.string()),
    })),
    config: z.optional(z.object({
        config: z.optional(AppleContainerImageVariantConfigSchema),
    })),
});

/**
 * `container image inspect <ref>` emits the same manifest-list-oriented shape as `image list`
 * (see `AppleContainerListImageRecord.ts`), just with the full OCI image config nested under
 * `variants[].config.config` instead of only `variants[].size`. No `--format` flag exists for
 * this command -- confirmed: `container image inspect --format json <ref>` errors with
 * "Unknown option '--format'"; JSON is the only output this command produces.
 */
export const AppleContainerInspectImageRecordSchema = z.object({
    id: z.string(),
    configuration: z.object({
        creationDate: z.optional(dateStringWithFallbackSchema),
        descriptor: z.optional(z.object({
            digest: z.optional(z.string()),
        })),
        name: z.optional(z.string()),
    }),
    variants: z.optional(z.array(AppleContainerInspectImageVariantSchema)),
});

export type AppleContainerInspectImageRecord = z.infer<typeof AppleContainerInspectImageRecordSchema>;

/**
 * A multi-platform image reports one variant per platform, plus an unrelated
 * `platform.architecture: "unknown"` attestation blob per real platform (see
 * `AppleContainerListImageRecord.ts`). Prefer the arm64/linux variant, since this client only
 * ever runs on Apple Silicon; fall back to the first non-attestation variant otherwise.
 */
function selectPrimaryVariant(variants: AppleContainerInspectImageRecord['variants']) {
    const usable = (variants ?? []).filter((variant) => variant.platform?.architecture !== 'unknown');
    return usable.find((variant) => variant.platform?.architecture === 'arm64' && variant.platform?.os === 'linux') ?? usable[0];
}

/**
 * Normalize a parsed {@link AppleContainerInspectImageRecord} to the common
 * {@link InspectImagesItem}.
 */
export function normalizeAppleContainerInspectImageRecord(image: AppleContainerInspectImageRecord, raw: string): InspectImagesItem {
    const variant = selectPrimaryVariant(image.variants);
    const config = variant?.config?.config;
    const nameInfo = parseDockerLikeImageName(image.configuration.name);
    const digest = image.configuration.descriptor?.digest;
    // Matches the `repository@sha256:...` form SharedInspectImageRecord uses, rather than a
    // bare digest.
    const repository = nameInfo.registry ? `${nameInfo.registry}/${nameInfo.image}` : nameInfo.image;

    return {
        // `container` has no ID-based image addressing (see the note in
        // AppleContainerListImageRecord.ts); mirror that file's `id` choice so this stays a
        // usable CLI reference rather than an inert digest.
        id: image.configuration.name ?? image.id,
        image: nameInfo,
        repoDigests: repository && digest ? [`${repository}@${digest}`] : [],
        // `image inspect` doesn't distinguish local-only images from ones pulled from a
        // registry; every inspectable image is on-disk, so this is always true.
        isLocalImage: true,
        environmentVariables: parseDockerLikeEnvironmentVariables(config?.Env ?? []),
        // No ExposedPorts-equivalent field observed in the OCI image config `image inspect`
        // emits.
        ports: [],
        // No Volumes-equivalent field observed.
        volumes: [],
        labels: config?.Labels ?? {},
        entrypoint: config?.Entrypoint ?? [],
        command: config?.Cmd ?? [],
        currentDirectory: config?.WorkingDir,
        architecture: architectureStringSchema.parse(variant?.platform?.architecture ?? ''),
        operatingSystem: osTypeStringSchema.parse(variant?.platform?.os ?? ''),
        createdAt: image.configuration.creationDate,
        user: config?.User,
        raw,
    };
}
