/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

/**
 * The type of container OS
 */
export const ContainerOSSchema = z.enum(['linux', 'windows']);
export type ContainerOS = z.infer<typeof ContainerOSSchema>;

/**
 * Types of event actions that can be listened for. More may exist.
 */
export const EventActionSchema = z.union([z.enum(['create', 'destroy', 'delete', 'start', 'stop', 'restart', 'pause', 'update']), z.string()]);
export type EventAction = z.infer<typeof EventActionSchema>;

/**
 * Types of objects that can be listened for events to. More may exist.
 */
export const EventTypeSchema = z.union([z.enum(['container', 'image', 'network', 'volume', 'daemon', 'plugin', 'config', 'secret', 'service', 'node', 'task', 'engine']), z.string()]);
export type EventType = z.infer<typeof EventTypeSchema>;
