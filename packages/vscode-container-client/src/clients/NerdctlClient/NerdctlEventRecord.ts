/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { type EventAction, EventActionSchema, type EventType, EventTypeSchema } from '../../contracts/ZodEnums';

/**
 * Schema for the nested Event payload in containerd events.
 * Contains container/image ID and optional attributes.
 * Uses looseObject to allow additional unknown fields from containerd.
 */
const NerdctlEventPayloadSchema = z.looseObject({
    id: z.optional(z.string()),
    // containerd task events (task/start, task/exit, etc.) identify the
    // container via 'container_id' (protojson may also camelCase to 'containerId')
    // rather than 'id'.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    container_id: z.optional(z.string()),
    containerId: z.optional(z.string()),
    key: z.optional(z.string()), // snapshot events use 'key' instead of 'id'
    image: z.optional(z.string()),
    name: z.optional(z.string()),
});

export type NerdctlEventPayload = z.infer<typeof NerdctlEventPayloadSchema>;

/**
 * Transform that parses a JSON string into NerdctlEventPayload.
 * Returns undefined if parsing fails (lenient parsing for event streams).
 */
const EventJsonStringSchema = z.pipe(z.string(), z.transform((str): NerdctlEventPayload | undefined => {
    try {
        const parsed: unknown = JSON.parse(str);
        // Validate against the payload schema
        const result = NerdctlEventPayloadSchema.safeParse(parsed);
        return result.success ? result.data : undefined;
    } catch {
        // Don't fail validation, just return undefined for invalid JSON
        return undefined;
    }
}));

/**
 * Nerdctl/nerdctl outputs containerd native events, NOT Docker-compatible events.
 * The format is significantly different from Docker's event format.
 *
 * Example output:
 * {
 *   "Timestamp": "2026-01-10T23:38:26.737324778Z",
 *   "ID": "",
 *   "Namespace": "finch",
 *   "Topic": "/containers/create",
 *   "Status": "unknown",
 *   "Event": "{\"id\":\"...\",\"image\":\"...\",\"runtime\":{...}}"
 * }
 */
export const NerdctlEventRecordSchema = z.object({
    Timestamp: z.string(),
    ID: z.optional(z.string()),
    Namespace: z.optional(z.string()),
    Topic: z.string(),
    Status: z.optional(z.string()),
    // Event is a JSON string that gets parsed into NerdctlEventPayload via transform
    Event: z.optional(EventJsonStringSchema),
});

export type NerdctlEventRecord = z.infer<typeof NerdctlEventRecordSchema>;

/**
 * Mapping from containerd topics to Docker-like event types and actions.
 * containerd uses topics like "/containers/create", "/images/delete", etc.
 */
const topicToTypeActionMap: Record<string, { type: EventType; action: EventAction } | undefined> = {
    '/containers/create': { type: 'container', action: 'create' },
    '/containers/delete': { type: 'container', action: 'destroy' },
    '/containers/update': { type: 'container', action: 'update' },
    '/tasks/start': { type: 'container', action: 'start' },
    '/tasks/exit': { type: 'container', action: 'stop' },
    '/tasks/delete': { type: 'container', action: 'delete' },
    '/tasks/paused': { type: 'container', action: 'pause' },
    '/images/create': { type: 'image', action: 'create' },
    '/images/delete': { type: 'image', action: 'delete' },
    '/images/update': { type: 'image', action: 'update' },
};

/**
 * Validates and returns a value if it matches the EventType schema, undefined otherwise.
 */
function validateEventType(value: string): EventType | undefined {
    const result = EventTypeSchema.safeParse(value);
    return result.success ? result.data : undefined;
}

/**
 * Validates and returns a value if it matches the EventAction schema, undefined otherwise.
 */
function validateEventAction(value: string): EventAction | undefined {
    const result = EventActionSchema.safeParse(value);
    return result.success ? result.data : undefined;
}

/**
 * Parse the containerd topic string to extract type and action.
 * Topics are in format: /type/action (e.g., /containers/create, /tasks/start)
 * Returns undefined if the type or action cannot be validated against known enum values.
 */
export function parseContainerdTopic(topic: string): { type: EventType; action: EventAction } | undefined {
    // First check exact matches
    const exactMatch = topicToTypeActionMap[topic];
    if (exactMatch) {
        return exactMatch;
    }

    // Try to parse from topic format: /category/action
    const parts = topic.split('/').filter(Boolean);
    if (parts.length >= 2) {
        const category = parts[0];
        const rawAction = parts[1];

        // Map category to Docker event type
        let mappedType: string;
        switch (category) {
            case 'containers':
                mappedType = 'container';
                break;
            case 'tasks':
                mappedType = 'container'; // Tasks are container-related
                break;
            case 'images':
                mappedType = 'image';
                break;
            case 'networks':
                mappedType = 'network';
                break;
            case 'volumes':
                mappedType = 'volume';
                break;
            case 'snapshot':
                // Snapshot events are internal containerd events, not typically exposed in Docker
                return undefined;
            default:
                // Unknown category - validate against schema
                mappedType = category;
        }

        // Validate both type and action against their respective schemas
        const type = validateEventType(mappedType);
        const action = validateEventAction(rawAction);

        // Only return if both are valid
        if (type !== undefined && action !== undefined) {
            return { type, action };
        }
    }

    return undefined;
}

/**
 * Extract the actor (id and attributes) from a parsed Event payload.
 * The Event field has already been parsed by the schema's transform.
 */
export function getActorFromEventPayload(payload: NerdctlEventPayload | undefined): { id: string; attributes: Record<string, unknown> } {
    if (!payload) {
        return { id: '', attributes: {} };
    }

    // Use 'id', 'container_id'/'containerId' for task events, or 'key' for snapshot events
    const id = payload.id ?? payload.container_id ?? payload.containerId ?? payload.key ?? '';

    // Extract relevant attributes
    const attributes: Record<string, unknown> = {};
    if (payload.image) {
        attributes.image = payload.image;
    }
    if (payload.name) {
        attributes.name = payload.name;
    }

    return { id, attributes };
}
