/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

// Nerdctl (nerdctl) version output structure
// nerdctl uses a different version format than Docker
export const NerdctlVersionRecordSchema = z.object({
    Client: z.object({
        Version: z.optional(z.string()),
        GitCommit: z.optional(z.string()),
        GoVersion: z.optional(z.string()),
        Os: z.optional(z.string()),
        Arch: z.optional(z.string()),
    }),
    Server: z.optional(z.object({
        Components: z.optional(z.array(z.object({
            Name: z.string(),
            Version: z.string(),
            Details: z.optional(z.record(z.string(), z.unknown())),
        }))),
    })),
});
