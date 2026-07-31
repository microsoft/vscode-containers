/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toArray } from '@microsoft/vscode-processutils';
import * as z from 'zod/mini';
import { tryParseSize } from '../clients/DockerClientBase/tryParseSize';
import { dayjs } from '../utils/dayjs';
import { parseDockerLikeImageName } from '../utils/parseDockerLikeImageName';
import type { ImageNameInfo, Labels } from './ContainerClient';

/**
 * Schema that transforms a date string to a Date object.
 * Returns undefined if the date is invalid.
 *
 * Uses the shared {@link dayjs} wrapper so that Docker/nerdctl-style timestamps
 * (e.g. `2024-06-01 12:00:00 +0000 UTC`) as well as ISO strings are parsed
 * consistently with the rest of the clients. Zod's built-in date helpers
 * (`z.iso.datetime`, `z.coerce.date`) only understand strict ISO input and
 * cannot parse the space-separated Docker format.
 */
export const dateStringSchema = z.pipe(z.string(), z.transform((str): Date | undefined => {
    const parsed = dayjs.utc(str);
    return parsed.isValid() ? parsed.toDate() : undefined;
}));

/**
 * Schema that transforms a date string to a Date object with a fallback to current time.
 * Never returns undefined - always provides a valid Date.
 */
export const dateStringWithFallbackSchema = z.pipe(z.string(), z.transform((str): Date => {
    const parsed = dayjs.utc(str);
    return parsed.isValid() ? parsed.toDate() : dayjs.utc().toDate();
}));

/**
 * Schema that transforms boolean-like strings (e.g. "true"/"false") to booleans.
 * Backed by Zod v4's `z.stringbool()`.
 */
export const booleanStringSchema = z.stringbool();

/**
 * Parse a Docker-like label string (comma-separated `key=value` pairs) into a
 * {@link Labels} record.
 *
 * `docker ... ls` and `nerdctl` join labels with commas and do NOT escape
 * commas inside values (e.g. multiple compose config files in
 * `com.docker.compose.project.config_files`). A fragment without an `=` is
 * therefore treated as a continuation of the previous label's value and
 * stitched back together. Empty/whitespace input yields an empty record.
 */
export function parseLabelsString(rawLabels: string): Labels {
    const labels: Labels = {};
    let lastKey: string | undefined;

    for (const fragment of rawLabels.split(',')) {
        const index = fragment.indexOf('=');

        if (index < 0) {
            if (lastKey !== undefined) {
                labels[lastKey] += `,${fragment}`;
            }
            continue;
        }

        lastKey = fragment.substring(0, index);
        labels[lastKey] = fragment.substring(index + 1);
    }

    return labels;
}

/**
 * Schema that transforms Docker-like label strings to a Record<string, string>.
 * The parsing logic lives in {@link parseLabelsString}.
 */
export const labelsStringSchema = z.pipe(z.string(), z.transform(parseLabelsString));

/**
 * Schema that handles labels as either a string (to be parsed) or already an object.
 * This is common in Docker/nerdctl outputs where labels can come in either format.
 */
export const labelsSchema = z.union([
    labelsStringSchema,
    z.record(z.string(), z.string()),
]);

/**
 * Schema that normalizes OS type strings to 'linux' | 'windows' | undefined.
 * Case-insensitive matching.
 */
export const osTypeStringSchema = z.pipe(z.string(), z.transform((str): 'linux' | 'windows' | undefined => {
    const lower = str.toLowerCase();
    if (lower === 'linux') {
        return 'linux';
    }
    if (lower === 'windows') {
        return 'windows';
    }
    return undefined;
}));

/**
 * Schema that normalizes architecture strings to 'amd64' | 'arm64' | undefined.
 * Case-insensitive matching.
 */
export const architectureStringSchema = z.pipe(z.string(), z.transform((str): 'amd64' | 'arm64' | undefined => {
    const lower = str.toLowerCase();
    if (lower === 'amd64' || lower === 'x86_64') {
        return 'amd64';
    }
    if (lower === 'arm64' || lower === 'aarch64') {
        return 'arm64';
    }
    return undefined;
}));

/**
 * Schema that transforms a Docker-like size value (a number of bytes or a
 * human-readable string such as `"12.34 GB"`) into a number of bytes.
 *
 * Backed by {@link tryParseSize}; `undefined`/`null`/`"N/A"`/unparseable input
 * yields `undefined`.
 */
export const sizeSchema = z.pipe(
    z.nullish(z.union([z.string(), z.number()])),
    z.transform((val): number | undefined => tryParseSize(val ?? undefined)),
);

/**
 * Schema that transforms a raw image name string into an {@link ImageNameInfo}
 * via {@link parseDockerLikeImageName}. A `null`/`undefined`/empty value yields
 * an {@link ImageNameInfo} with only `originalName` populated.
 */
export const imageNameSchema = z.pipe(
    z.nullish(z.string()),
    z.transform((val): ImageNameInfo => parseDockerLikeImageName(val ?? undefined)),
);

/**
 * Schema that coalesces a value that may be a single string, an array of
 * strings, or `null`/`undefined` into a `string[]` via {@link toArray}.
 *
 * Docker-like `Entrypoint`/`Cmd`/`Env` fields are emitted inconsistently as
 * either a scalar or an array depending on the runtime and object.
 */
export const stringArraySchema = z.pipe(
    z.nullish(z.union([z.array(z.string()), z.string()])),
    z.transform((val): string[] => toArray(val ?? [])),
);
