/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import type { ListContainersItem, PortBinding } from '../../contracts/ContainerClient';
import { labelsStringSchema } from '../../contracts/ZodTransforms';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { parseDockerRawPortString } from './parseDockerRawPortString';

/**
 * A single, tolerant schema for the Docker-compatible `ps`/`container ls`
 * per-line JSON emitted by Docker and nerdctl. Docker emits every field;
 * nerdctl may omit several. Labels are normalized by the shared transform.
 *
 * Podman's `ps` output is object-shaped (`Names`/`Ports` arrays, numeric
 * `Created`) and keeps its own record module rather than sharing this schema.
 */
export const SharedListContainerRecordSchema = z.object({
    ID: z.string(),
    Names: z.string(),
    Image: z.string(),
    Ports: z.optional(z.string()),
    Networks: z.optional(z.string()),
    // "key=value,key2=value2" string transformed to a record
    Labels: z.optional(labelsStringSchema),
    CreatedAt: z.optional(z.string()),
    State: z.optional(z.string()),
    Status: z.optional(z.string()),
});

export type SharedListContainerRecord = z.infer<typeof SharedListContainerRecordSchema>;

/**
 * Small per-runtime knobs that capture the intentional differences between the
 * Docker and nerdctl list-container normalizers. Defaults reproduce Docker's
 * behavior; nerdctl overrides the ones that differ.
 */
export interface NormalizeListContainerOptions {
    /**
     * Which status/state mapping to apply. Docker returns the `State` field
     * verbatim (falling back to a regex over `Status`); nerdctl maps its
     * `Up`/`Exited`/... status values onto the standard states.
     */
    stateStyle?: 'docker' | 'nerdctl';
    /**
     * Validate the creation date. Docker parses leniently (an invalid date
     * becomes an `Invalid Date`); nerdctl throws in strict mode and otherwise
     * falls back to the current time.
     */
    validateDate?: boolean;
    /**
     * Trim and drop empty entries when splitting the `Networks` string, and fall
     * back to the `nerdctl/networks` label when `Networks` is absent. Docker
     * splits the raw string as-is.
     */
    nerdctlNetworks?: boolean;
    /**
     * Throw in strict mode when a port string cannot be parsed. Docker throws;
     * nerdctl skips unparseable ports.
     */
    throwOnUnparseablePort?: boolean;
}

/**
 * Normalizes a Docker-style container state. Prefers the explicit `State` field
 * and otherwise infers the state from the human-readable `Status` string.
 *
 * Exported for tests.
 */
export function normalizeContainerState(container: { State?: string; Status?: string }): string {
    if (container.State) {
        return container.State;
    }

    const status = container.Status ?? '';

    if (/paused/i.test(status)) {
        return 'paused';
    } else if (/exit|terminate|dead/i.test(status)) {
        return 'exited';
    } else if (/created/i.test(status)) {
        return 'created';
    } else if (/up/i.test(status)) {
        return 'running';
    }

    return 'unknown';
}

/**
 * Normalizes an nerdctl container status (e.g. `Up`, `Exited`) to the standard
 * state values.
 */
function normalizeNerdctlContainerState(status: string | undefined): string {
    if (!status) {
        return 'unknown';
    }

    const lowerStatus = status.toLowerCase();

    // Map nerdctl status values to standard Docker states
    if (lowerStatus.startsWith('up')) {
        return 'running';
    }
    if (lowerStatus.startsWith('exited')) {
        return 'exited';
    }
    if (lowerStatus.startsWith('created')) {
        return 'created';
    }
    if (lowerStatus.startsWith('paused')) {
        return 'paused';
    }
    if (lowerStatus.startsWith('restarting')) {
        return 'restarting';
    }
    if (lowerStatus.startsWith('removing')) {
        return 'removing';
    }
    if (lowerStatus.startsWith('dead')) {
        return 'dead';
    }

    // If it's already a standard state, use it
    if (['running', 'exited', 'created', 'paused', 'restarting', 'removing', 'dead'].includes(lowerStatus)) {
        return lowerStatus;
    }

    return 'unknown';
}

/**
 * Extracts networks from nerdctl Labels.
 * nerdctl stores networks in Labels as: nerdctl/networks=["bridge","custom-net"]
 */
function extractNetworksFromLabels(labels: Record<string, string>): string[] {
    const networksJson = labels['nerdctl/networks'];
    if (!networksJson) {
        return [];
    }

    try {
        const parsed: unknown = JSON.parse(networksJson);
        if (Array.isArray(parsed)) {
            return parsed.filter((n): n is string => typeof n === 'string');
        }
    } catch {
        // Ignore parse errors
    }
    return [];
}

function resolveCreatedAt(raw: string | undefined, strict: boolean, validateDate: boolean): Date {
    if (raw) {
        const parsed = dayjs.utc(raw);
        if (parsed.isValid()) {
            return parsed.toDate();
        }
        if (validateDate) {
            if (strict) {
                throw new Error(`Invalid container creation date: ${raw}`);
            }
            return new Date(); // Use current time as fallback (less misleading than an Invalid Date)
        }
        return parsed.toDate(); // Docker: preserve the (invalid) parse result
    }

    if (validateDate && strict) {
        throw new Error('Container creation date is missing');
    }
    // Docker: dayjs.utc(undefined) yields the current time
    return validateDate ? new Date() : dayjs.utc(raw).toDate();
}

function resolvePorts(portsStr: string | undefined, strict: boolean, throwOnUnparseablePort: boolean): PortBinding[] {
    const ports: PortBinding[] = [];
    if (!portsStr) {
        return ports;
    }

    for (const rawPort of portsStr.split(',')) {
        const trimmed = rawPort.trim();
        if (!trimmed) {
            continue;
        }

        const parsed = parseDockerRawPortString(trimmed);
        if (parsed) {
            ports.push(parsed);
        } else if (strict && throwOnUnparseablePort) {
            throw new Error('Invalid container JSON');
        }
    }

    return ports;
}

/**
 * Normalize a parsed {@link SharedListContainerRecord} to the common
 * {@link ListContainersItem}. Behavior is identical across runtimes except for
 * the knobs described by {@link NormalizeListContainerOptions}.
 */
export function normalizeListContainerRecord(container: SharedListContainerRecord, strict: boolean, options: NormalizeListContainerOptions = {}): ListContainersItem {
    const labels = container.Labels ?? {};

    const name = (container.Names ?? '').split(',')[0]?.trim() ?? '';

    const ports = resolvePorts(container.Ports, strict, options.throwOnUnparseablePort ?? true);

    let networks: string[];
    if (options.nerdctlNetworks) {
        if (container.Networks) {
            networks = container.Networks.split(',').map((n) => n.trim()).filter(Boolean);
        } else {
            networks = extractNetworksFromLabels(labels);
        }
    } else {
        networks = (container.Networks ?? '').split(',');
    }

    const createdAt = resolveCreatedAt(container.CreatedAt, strict, options.validateDate ?? false);

    const state = options.stateStyle === 'nerdctl'
        ? normalizeNerdctlContainerState(container.State || container.Status)
        : normalizeContainerState(container);

    return {
        id: container.ID,
        name,
        labels,
        image: parseDockerLikeImageName(container.Image),
        ports,
        networks,
        createdAt,
        state,
        status: container.Status,
    };
}
