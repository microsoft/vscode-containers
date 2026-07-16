/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { ListContainersItem, PortBinding } from '../../contracts/ContainerClient';
import { labelsStringSchema } from '../../contracts/ZodTransforms';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { parseDockerRawPortString } from '../DockerClientBase/parseDockerRawPortString';

/**
 * Nerdctl (nerdctl) container list output format.
 * Labels are transformed during parsing from "key=value,key2=value2" to Record.
 */
export const NerdctlListContainerRecordSchema = z.object({
    ID: z.string(),
    Names: z.string(),
    Image: z.string(),
    Ports: z.optional(z.string()),
    Networks: z.optional(z.string()),
    // Labels transformed from string to Record during parsing
    Labels: z.optional(labelsStringSchema),
    CreatedAt: z.optional(z.string()),
    State: z.optional(z.string()),
    Status: z.optional(z.string()),
});

export type NerdctlListContainerRecord = z.infer<typeof NerdctlListContainerRecordSchema>;

/**
 * Normalizes nerdctl/Nerdctl container status to standard state values.
 * nerdctl uses "Up" instead of "running", "Exited" instead of "exited", etc.
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

export function normalizeNerdctlListContainerRecord(container: NerdctlListContainerRecord, strict: boolean): ListContainersItem {
    // nerdctl outputs names as a single string
    const name = container.Names?.trim() || '';

    // Parse creation date - validate and provide fallback for malformed/missing values
    let createdAt: Date;
    if (container.CreatedAt) {
        const parsedDate = dayjs.utc(container.CreatedAt);
        if (parsedDate.isValid()) {
            createdAt = parsedDate.toDate();
        } else if (strict) {
            throw new Error(`Invalid container creation date: ${container.CreatedAt}`);
        } else {
            createdAt = new Date(); // Use current time as fallback (less misleading than epoch)
        }
    } else if (strict) {
        throw new Error('Container creation date is missing');
    } else {
        createdAt = new Date(); // Use current time as fallback
    }

    // Parse port bindings from string format like "0.0.0.0:8080->80/tcp"
    const ports: PortBinding[] = [];
    if (container.Ports) {
        container.Ports.split(',').forEach((portStr) => {
            const trimmedPort = portStr.trim();
            if (trimmedPort) {
                try {
                    const parsed = parseDockerRawPortString(trimmedPort);
                    if (parsed) {
                        ports.push(parsed);
                    }
                } catch {
                    // Ignore unparseable port strings in non-strict mode
                    if (strict) {
                        throw new Error(`Failed to parse port string: ${trimmedPort}`);
                    }
                }
            }
        });
    }

    // Labels are already parsed by the schema transform
    const labels = container.Labels ?? {};

    // Extract networks: prefer Networks field if present, otherwise extract from labels
    // In nerdctl, networks may be stored in Labels as JSON under 'nerdctl/networks' key
    let networks: string[];
    if (container.Networks) {
        networks = container.Networks.split(',').map((n) => n.trim()).filter(Boolean);
    } else {
        networks = extractNetworksFromLabels(labels);
    }

    // Normalize state: nerdctl uses Status field with values like "Up", "Exited"
    // instead of State field with "running", "exited"
    const state = normalizeNerdctlContainerState(container.State || container.Status);

    return {
        id: container.ID,
        image: parseDockerLikeImageName(container.Image),
        name,
        labels,
        createdAt,
        ports,
        networks,
        state,
        status: container.Status,
    };
}
