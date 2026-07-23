/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Represents a text content item.
 */
export type TextContent = {
    /**
     * The type must be exactly 'text'
     */
    type: 'text',

    /**
     * The text content of the item
     */
    text: string,
};

/**
 * A call tool result. This is a subset of the options provided by the MCP SDK.
 */
export type McpToolResult = {
    /**
     * The text content returned by the tool
     */
    content: TextContent[],

    /**
     * If true, the tool execution resulted in an error.
     * The content should contain an error message.
     */
    isError?: boolean,
} | {
    /**
     * The text content returned by the tool
     */
    content: TextContent[],

    /**
     * The structured content returned by the tool.
     * MCP documentation recommends also putting the JSONified representation
     * in the content field.
     */
    structuredContent: Record<string, unknown>,
};
