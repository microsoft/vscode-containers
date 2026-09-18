/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Agent actions, derived from the tRPC router.
//
// The panel and the agent should not be two implementations of the same API.
// Every procedure already carries a name, a type, a zod input schema and a
// handler -- which is exactly what a canvas action needs -- so the action list
// is generated rather than written a second time.
//
// The payoff is not brevity. It is that a button and an agent call run the same
// validated procedure: the agent cannot reach a code path the UI's zod schema
// would have rejected, and a new procedure cannot ship without an agent action.

import { z } from "zod/v4";

const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false };

/**
 * Describe every agent-visible procedure on a router.
 *
 * @param router a tRPC router
 * @param meta   the AGENT_META map: `{ [name]: { description?, agent? } }`
 * @returns `[{ name, type, description, inputSchema }]`
 */
export function describeProcedures(router, meta = {}) {
    const procedures = router?._def?.procedures ?? {};

    // A stale key in the map means a procedure was renamed or removed and the
    // metadata was not updated. Fail at startup rather than silently shipping a
    // description for something that no longer exists.
    const unknown = Object.keys(meta).filter((name) => !(name in procedures));
    if (unknown.length) {
        throw new Error(`AGENT_META describes procedures that do not exist: ${unknown.join(", ")}`);
    }

    return Object.entries(procedures)
        .filter(([name]) => meta[name]?.agent !== false)
        .map(([name, procedure]) => {
            const def = procedure._def ?? {};
            const input = def.inputs?.[0];
            let inputSchema = EMPTY_SCHEMA;
            if (input) {
                // `$schema` is noise in a tool definition, and some hosts reject it.
                const { $schema, ...rest } = z.toJSONSchema(input);
                inputSchema = rest;
            }
            return {
                name,
                type: def.type ?? "query",
                description: meta[name]?.description ?? `${name} (${def.type ?? "query"})`,
                inputSchema,
            };
        });
}

/**
 * Turn those descriptions into canvas actions.
 *
 * @param describe  returns the procedure descriptions for the live instance
 * @param call      invokes a procedure by name: `(name, input) => Promise`
 * @param instanceFor throws a CanvasError when the panel is not open
 */
export function buildCanvasActions({ describe, call, instanceFor }) {
    return describe().map((procedure) => ({
        name: procedure.name,
        description: procedure.description,
        inputSchema: procedure.inputSchema,
        handler: async (ctx) => {
            // Resolve the instance first so a closed panel is a clear error
            // rather than a confusing failure inside a procedure.
            instanceFor(ctx.instanceId);
            const result = await call(ctx.instanceId, procedure.name, ctx.input ?? {});
            return result ?? { ok: true };
        },
    }));
}
