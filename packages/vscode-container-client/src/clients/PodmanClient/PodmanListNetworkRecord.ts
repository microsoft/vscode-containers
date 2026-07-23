/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

export const PodmanListNetworkRecordSchema = z.object({
    Name: z.optional(z.string()), // v3
    name: z.optional(z.string()), // Not in v3
    id: z.optional(z.string()), // Not in v3
    driver: z.optional(z.string()), // Not in v3
    created: z.optional(z.string()), // Not in v3
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ipv6_enabled: z.optional(z.boolean()), // Not in v3
    internal: z.optional(z.boolean()), // Not in v3
    Labels: z.nullish(z.record(z.string(), z.string())), // v3
    labels: z.nullish(z.record(z.string(), z.string())), // Maybe in v4?
});
