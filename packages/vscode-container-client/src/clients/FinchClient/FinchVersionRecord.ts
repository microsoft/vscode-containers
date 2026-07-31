/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';

// Finch implements `version` itself rather than forwarding it to nerdctl, so the
// nerdctl version information is nested under `Client.NerdctlClient`, while
// `Client.Version` is the Finch version. `Server` is passed through from nerdctl
// unmodified.
export const FinchVersionRecordSchema = z.object({
    Client: z.object({
        Version: z.optional(z.string()),
        GitCommit: z.optional(z.string()),
        GoVersion: z.optional(z.string()),
        Os: z.optional(z.string()),
        Arch: z.optional(z.string()),
        NerdctlClient: z.optional(z.object({
            Version: z.optional(z.string()),
            GitCommit: z.optional(z.string()),
            GoVersion: z.optional(z.string()),
            Os: z.optional(z.string()),
            Arch: z.optional(z.string()),
        })),
    }),
    Server: z.optional(z.object({
        Components: z.optional(z.array(z.object({
            Name: z.string(),
            Version: z.string(),
            Details: z.optional(z.record(z.string(), z.unknown())),
        }))),
    })),
});
