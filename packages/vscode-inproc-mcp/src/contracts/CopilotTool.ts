/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationTokenLike } from '@microsoft/vscode-processutils';
import type { z } from 'zod';

/**
 * Represents a tool that can be used by Copilot
 */
export interface CopilotTool<TInSchema extends ToolIOSchema, TOutSchema extends ToolIOSchema> {
    /**
     * The name of the tool. Must be unique. Should use snake_case.
     */
    readonly name: string;

    /**
     * A human-readable title for the tool. Used only for display purposes.
     */
    readonly title?: string;

    /**
     * A human-readable description for the tool's functionality.
     * This is presented to the LLM as well as displayed to the user.
     */
    readonly description?: string;

    /**
     * If the tool requires inputs, this schema defines the shape of the input data
     */
    readonly inputSchema?: TInSchema;

    /**
     * If the tool produces outputs, this schema defines the shape of the output data
     */
    readonly outputSchema?: TOutSchema;

    /**
     * Optional annotations about the tool's behavior
     */
    readonly annotations?: ToolAnnotations;

    /**
     * Executes the tool with the given input and extra parameters
     */
    execute: Executor<TInSchema, TOutSchema>;
}

/**
 * Enforce some rules about tool schema
 */
export type ToolIOSchema = z.ZodVoid | z.ZodObject<z.ZodRawShape>;

/**
 * Type for the function that executes the tool
 * @param input The input *object* to the tool
 * @param extra Additional execution context, such as cancellation tokens
 * @returns The output *object* from the tool
 */
export type Executor<TInSchema extends ToolIOSchema, TOutSchema extends ToolIOSchema> = (
    input: z.infer<TInSchema>,
    extra?: ToolExecutionExtras
) => z.infer<TOutSchema> | Promise<z.infer<TOutSchema>>;

/**
 * Optional annotations about the tool's behavior. Arbitrary
 * annotations are allowed.
 */
export interface ToolAnnotations extends Record<string, unknown> {
    /**
     * If true, the tool's functionality is read-only and should not modify any data
     */
    readonly readOnlyHint?: boolean;

    /**
     * If true, the tool's functionality is destructive and may modify or delete data.
     * If it only creates new data, this can be false.
     */
    readonly destructiveHint?: boolean;

    /**
     * If true, the tool's functionality is idempotent and can be called multiple times
     * without additional effects
     */
    readonly idempotentHint?: boolean;

    /**
     * If true, the tool may access an "open world" of data, including but not limited
     * to web requests. If false, the tool's access is restricted.
     */
    readonly openWorldHint?: boolean;

    /**
     * Guidelines to the client on tool usage consent requirements.
     * This is not a part of the MCP specification at this time, but
     * still useful.
     */
    readonly consentGuidance?: ConsentGuidance;
}

/**
 * Guidelines to the client on tool usage consent requirements
 */
export enum ConsentGuidance {
    /**
     * Consent is not required. Acceptable only for read-only tools.
     */
    NotRequired = 'NotRequired',

    /**
     * Consent is required, but the client can facilitate auto-approval,
     * if the user desires
     */
    Default = 'Default',

    /**
     * Consent is always required, and the client must prompt every time.
     * This is especially important for destructive tools.
     */
    AlwaysRequired = 'AlwaysRequired',
}

/**
 * Additional context for executing a tool
 */
export type ToolExecutionExtras = {
    /**
     * A signal to abort the execution. This signal is intrinsically tied to the
     * {@link CancellationTokenLike} below. If one is triggered, the other will
     * be as well. Only one should be monitored.
     */
    signal: AbortSignal;

    /**
     * Optional cancellation token to cancel the execution. This token is
     * intrinsically tied to the {@link AbortSignal} above. If one is triggered,
     * the other will be as well. Only one should be monitored.
     */
    token?: CancellationTokenLike;

    /**
     * Optional session ID for the current Copilot session.
     */
    sessionId?: string;

    /**
     * Request ID for the current Copilot request.
     */
    requestId: string | number;
};
