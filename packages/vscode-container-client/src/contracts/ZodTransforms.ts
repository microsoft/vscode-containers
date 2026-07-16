/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { dayjs } from '../utils/dayjs';
import { Labels } from './ContainerClient';

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
export const labelsSchema = z.pipe(
    z.union([
        labelsStringSchema,
        z.record(z.string(), z.string()),
    ]),
    z.transform((val): Labels => val ?? {}),
);

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
