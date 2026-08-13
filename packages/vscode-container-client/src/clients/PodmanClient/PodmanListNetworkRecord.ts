/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

export const PodmanListNetworkRecordSchema = z.object({
    name: z.optional(z.string()),
    id: z.optional(z.string()),
    driver: z.optional(z.string()),
    created: z.optional(z.string()),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ipv6_enabled: z.optional(z.boolean()),
    internal: z.optional(z.boolean()),
    labels: z.nullish(z.record(z.string(), z.string())),
});
