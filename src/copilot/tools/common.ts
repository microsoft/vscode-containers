/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { z } from 'zod';

export const ImageInfoSchema = z.object({
    originalName: z.string().nullish(),
    image: z.string().nullish(),
    registry: z.string().nullish(),
    tag: z.string().nullish(),
    digest: z.string().nullish(),
});

export const PortBindingSchema = z.object({
    containerPort: z.number(),
    hostPort: z.number().nullish(),
    hostIp: z.string().nullish(),
    protocol: z.enum(['tcp', 'udp']).nullish(),
});
