/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { startInProcHttpServer } from './inProcHttpServer';
import type { McpProviderOptions } from './McpProviderOptions';

/**
 * Registers an in-proc MCP HTTP server provider
 * @param context The extension context
 * @param options The options for the MCP provider
 */
export function registerMcpHttpProvider(context: vscode.ExtensionContext, options: McpProviderOptions): void {
    context.subscriptions.push(
        vscode.lm.registerMcpServerDefinitionProvider(options.id, {
            provideMcpServerDefinitions(token: vscode.CancellationToken): vscode.ProviderResult<vscode.McpServerDefinition[]> {
                return [
                    new vscode.McpHttpServerDefinition(
                        options.serverLabel,
                        vscode.Uri.from({ scheme: 'http', authority: 'invalid.invalid' }), // Dummy URL; the MCP server will be in-proc and must be resolved first
                        undefined,
                        options.serverVersion
                    ),
                ];
            },
            async resolveMcpServerDefinition(server: vscode.McpHttpServerDefinition, token: vscode.CancellationToken): Promise<vscode.McpServerDefinition> {
                const { disposable, serverUri, headers } = await startInProcHttpServer(options);
                context.subscriptions.push(disposable);
                server.uri = serverUri;
                server.headers = headers;
                return server;
            },
            onDidChangeMcpServerDefinitions: options.onDidChange,
        })
    );
}
