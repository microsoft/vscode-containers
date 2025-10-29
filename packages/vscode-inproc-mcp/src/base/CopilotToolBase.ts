/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { z } from 'zod';
import { ConsentGuidance, CopilotTool, Executor, ToolAnnotations, ToolExecutionExtras, ToolIOSchema } from '../contracts/CopilotTool';

/**
 * Base implementation for copilot tools, that validates the input and output against the schemas
 */
export class CopilotToolBase<TInSchema extends ToolIOSchema, TOutSchema extends ToolIOSchema> implements CopilotTool<TInSchema, TOutSchema> {
    public readonly title?: string;
    public readonly description?: string;
    public readonly inputSchema?: TInSchema;
    public readonly outputSchema?: TOutSchema;
    public readonly annotations?: ToolAnnotations;

    /**
     * Constructs a new {@link CopilotToolBase} instance
     * @param name The tool name
     * @param executeImpl The tool implementation
     * @param options Tool options such as title, schemas, and annotations
     * @throws An {@link Error} if the tool is improperly configured
     */
    public constructor(
        public readonly name: string,
        protected readonly executeImpl: Executor<TInSchema, TOutSchema>,
        options?: {
            title?: string,
            description?: string,
            inputSchema?: TInSchema,
            outputSchema?: TOutSchema,
            annotations?: ToolAnnotations,
        }
    ) {
        this.title = options?.title;
        this.description = options?.description;
        this.inputSchema = options?.inputSchema;
        this.outputSchema = options?.outputSchema;
        this.annotations = options?.annotations;

        // Always enforce consent for non-read-only tools
        if (this.annotations?.consentGuidance === ConsentGuidance.NotRequired &&
            !this.annotations?.readOnlyHint) {
            throw new Error('A tool with "NotRequired" consent guidance must have a read-only hint.');
        }

        // Do not allow readonly and destructive hints at the same time
        if (!!this.annotations?.readOnlyHint && !!this.annotations?.destructiveHint) {
            throw new Error('A tool cannot be both read-only and destructive.');
        }
    }

    /**
     * @throws A {@link z.ZodError} if the input does not match the input schema,
     * or if the output does not match the output schema
     */
    public async execute(input: z.infer<TInSchema>, extra?: ToolExecutionExtras): Promise<z.infer<TOutSchema>> {
        if (!!this.inputSchema) {
            // Will throw a ZodError if incorrect
            await this.inputSchema.parseAsync(input);
        }

        const output = await Promise.resolve(this.executeImpl(input, extra));

        if (!!this.outputSchema) {
            // Will throw a ZodError if incorrect
            await this.outputSchema.parseAsync(output);
        }

        return output;
    }
}
