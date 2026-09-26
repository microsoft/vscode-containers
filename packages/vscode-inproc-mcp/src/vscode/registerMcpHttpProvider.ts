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
    let tcpServer: Awaited<ReturnType<typeof startInProcHttpServer>> | undefined;

    async function getTcpServer(): Promise<ReturnType<typeof startInProcHttpServer>> {
        if (tcpServer) {
            return tcpServer;
        }

        tcpServer = await startInProcHttpServer(options);
        context.subscriptions.push(tcpServer.disposable);
        return tcpServer;
    }

    context.subscriptions.push(
        vscode.lm.registerMcpServerDefinitionProvider(options.id, {
            async provideMcpServerDefinitions(token: vscode.CancellationToken): Promise<vscode.McpServerDefinition[]> {
                if (options.useTcpTransport) {
                    // The Copilot harness consumes TCP definitions without calling resolveMcpServerDefinition,
                    // so discovery must start and expose the real endpoint right away.
                    const { serverUri, headers } = await getTcpServer();
                    return [
                        new vscode.McpHttpServerDefinition(
                            options.serverLabel,
                            serverUri,
                            headers,
                            options.serverVersion
                        ),
                    ];
                }

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
                const { disposable, serverUri, headers } = options.useTcpTransport ?
                    await getTcpServer() :
                    await startInProcHttpServer(options);

                if (!options.useTcpTransport) {
                    context.subscriptions.push(disposable);
                } else {
                    // Skip, the tcp server disposable has already been added
                }

                server.uri = serverUri;
                server.headers = headers;
                return server;
            },
            onDidChangeMcpServerDefinitions: options.onDidChange,
        })
    );
}
