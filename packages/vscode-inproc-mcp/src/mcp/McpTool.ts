/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenLike } from '@microsoft/vscode-processutils';
import { z } from 'zod';
import { CopilotToolBase } from '../base/CopilotToolBase';
import type { ToolExecutionExtras, ToolIOSchema } from '../contracts/CopilotTool';
import { getErrorMessage } from '../utils/getErrorMessage';
import type { McpToolResult } from './McpToolResult';

/**
 * Message returned to the MCP client if a tool is successful but produces no output
 */
const UnknownSuccessMessage = 'Tool execution succeeded, but produced no output.';

/**
 * Message returned to the MCP client if a tool execution was cancelled by the user
 */
const CancelledMessage = 'Tool execution was cancelled by the user.';

/**
 * Message returned to the MCP client if a tool fails and we can't determine the error message
 */
const UnknownErrorMessage = 'An unknown error occurred.';

/**
 * Message returned if there are no results from an array-returning tool
 */
const NoResultsMessage = 'Tool execution succeeded, but no results were found.';

/**
 * Class for MCP server tools
 */
export class McpTool<TInSchema extends ToolIOSchema, TOutSchema extends ToolIOSchema> extends CopilotToolBase<TInSchema, TOutSchema> {
    /**
     * Executes the MCP tool with the given input and extra parameters.
     * Automatically converts the output to the format required by MCP
     * tools. Will never throw an error.
     * @param input The input for the tool
     * @param extra Additional execution parameters. The base class
     * allows this to be undefined, but the MCP SDK does not.
     * @returns The result of the tool execution in the {@link McpToolResult}
     * format
     */
    public async executeMcp(input: z.infer<TInSchema>, extra: ToolExecutionExtras): Promise<McpToolResult> {
        try {
            // Ensure we have a signal and token to work with. In MCP the signal will always be defined.
            extra.token ||= CancellationTokenLike.fromAbortSignal(extra.signal);

            const result = await this.execute(input, extra);

            if (!!this.outputSchema && !(this.outputSchema instanceof z.ZodVoid)) {
                // If there is an output schema, assume we want to return structured content to the MCP client
                // The base class will have already validated that the output matches the schema
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result), // MCP docs suggest returning the result as a JSON string in addition to the structured content
                        },
                    ],
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    structuredContent: result!, // The base class will have already validated that the output matches the schema
                };
            } else if (result === undefined || result === null) {
                // If the result is undefined or null (or void, etc.), just return a success message
                return {
                    content: [
                        {
                            type: 'text',
                            text: UnknownSuccessMessage,
                        },
                    ],
                };
            } else if (Array.isArray(result)) {
                // Technically this isn't legal right now, but let's handle it anyway in case we add it later
                // If it's an array, return JSONified text of each item in the array
                // But if it's empty, return a special message
                if (result.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: NoResultsMessage,
                            },
                        ],
                    };
                }

                return {
                    content: result.map(item => ({
                        type: 'text',
                        text: JSON.stringify(item),
                    })),
                };
            } else {
                // Otherwise, return JSONified text
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result),
                        },
                    ],
                };
            }
        } catch (error) {
            // If the abort signal was triggered, return a cancelled message
            if (extra?.signal?.aborted) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: CancelledMessage,
                        },
                    ],
                    isError: true,
                };
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: getErrorMessage(error) || UnknownErrorMessage,
                    },
                ],
                isError: true,
            };
        }
    }
}
