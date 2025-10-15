/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';

export const ContainerRefSchema = z.object({
    containerNameOrId: z.string().describe('The container name or ID.'),
});

export const ImageRefSchema = z.object({
    imageNameOrId: z.string().describe('The container image name or ID.'),
});

export function isoTheCreatedAt<T extends { createdAt?: Date }>(items: T[]) {
    return items.map(item => ({
        ...item,
        createdAt: item.createdAt?.toISOString(),
    }));
}
