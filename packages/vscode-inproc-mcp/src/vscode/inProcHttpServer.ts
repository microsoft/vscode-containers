/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DisposableLike } from '@microsoft/vscode-processutils';
import * as crypto from 'crypto';
import type * as express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getErrorMessage } from '../utils/getErrorMessage';
import { Lazy } from '../utils/Lazy';
import type { McpProviderOptions } from './McpProviderOptions';

type SessionTransport = {
    handleRequest: (req: express.Request, res: express.Response, parsedBody?: unknown) => Promise<void>;
    close: () => Promise<void>;
};

const transports: Record<string, SessionTransport> = {};

/**
 * Starts a new MCP HTTP server instance on a random named pipe (Windows) or Unix socket (Unix).
 * @param mcpOptions Options for the MCP server
 * @returns An object containing the disposable to stop and clean up the server, the server URI, and headers
 * that should be attached to all requests
 */
export async function startInProcHttpServer(mcpOptions: McpProviderOptions): Promise<{ disposable: DisposableLike, serverUri: vscode.Uri, headers: Record<string, string> }> {
    let socketPath: string | undefined;

    try {
        const nonce = crypto.randomUUID();
        socketPath = getRandomSocketPath();

        const express = await expressLazy.value;

        const app = express.default();

        app.use(express.default.json());
        app.use((req, res, next) => authMiddleware(nonce, req, res, next));

        app.post('/mcp', (req, res) => handlePost(mcpOptions, req, res));
        app.get('/mcp', handleGetDelete);
        app.delete('/mcp', handleGetDelete);

        const httpServer = app.listen(socketPath);

        return {
            disposable: {
                dispose: () => {
                    // Clean up all transports
                    for (const sessionId in transports) {
                        void transports[sessionId].close();
                        delete transports[sessionId];
                    }

                    // Close the Express server
                    if (httpServer.listening) {
                        httpServer.close();
                        httpServer.closeAllConnections();
                    }

                    // Clean up the socket path
                    tryCleanupSocket(socketPath);
                }
            },
            serverUri: vscode.Uri.from({
                scheme: os.platform() === 'win32' ? 'pipe' : 'unix',
                path: socketPath,
                fragment: '/mcp', // The express app is configured to serve MCP over the `/mcp` route, and VSCode wants that route in the URI fragment
            }),
            headers: {
                'Authorization': `Nonce ${nonce}`,
            },
        };
    } catch (err) {
        tryCleanupSocket(socketPath);
        throw err;
    }
}

function authMiddleware(nonce: string, req: express.Request, res: express.Response, next: express.NextFunction): void {
    if (req.headers.authorization !== `Nonce ${nonce}`) {
        res.status(401).send('Unauthorized');
        return;
    }

    next();
}

async function handlePost(mcpOptions: McpProviderOptions, req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const { isInitializeRequest, McpServer } = await mcpServerModuleLazy.value;
    const { NodeStreamableHTTPServerTransport } = await mcpNodeModuleLazy.value;

    let transport: SessionTransport;
    if (sessionId && transports[sessionId]) {
        // Existing session
        transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
        // New session initialization request
        transport = new NodeStreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (sessionId) => {
                transports[sessionId] = transport;
            },
            onsessionclosed: (sessionId) => {
                delete transports[sessionId];
            },
            enableDnsRebindingProtection: true,
            allowedHosts: ['localhost'],
        });

        const server = new McpServer(
            {
                name: mcpOptions.id,
                title: mcpOptions.serverLabel,
                version: mcpOptions.serverVersion,
            }
        );

        try {
            // ESM and CJS declarations expose nominally distinct McpServer classes.
            // Both builds share runtime shape, so bridge via the option's parameter type.
            await Promise.resolve(
                mcpOptions.registerTools(
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
                    server as unknown as Parameters<McpProviderOptions['registerTools']>[0]
                )
            );
        } catch (err) {
            // Failed to register tools, return error
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: `Failed to register MCP tools: ${getErrorMessage(err)}`,
                },
                id: null,
            });
            return;
        }

        await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
    } else {
        // Invalid request
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Bad Request: No valid session ID provided',
            },
            id: null,
        });
        return;
    }

    await transport.handleRequest(req, res, req.body);
}

async function handleGetDelete(req: express.Request, res: express.Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
}

function getRandomSocketPath(): string {
    if (os.platform() === 'win32') {
        // On Windows, use a named pipe
        return `\\\\.\\pipe\\mcp-${crypto.randomUUID()}.sock`;
    } else {
        // On Unix systems, use a file in the temp directory
        const prefix = path.join(os.tmpdir(), 'mcp-');
        const tempDir = fs.mkdtempSync(prefix);

        // Set the permissions on the new directory to 0o700
        fs.chmodSync(tempDir, 0o700);

        return path.join(tempDir, 'mcp.sock');
    }
}

function tryCleanupSocket(socketPath: string | undefined): void {
    try {
        if (os.platform() === 'win32') {
            // No cleanup needed for Windows named pipes
            return;
        }

        if (!socketPath) {
            return;
        }

        // Remove the directory and its contents
        const dir = path.dirname(socketPath);
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    } catch {
        // Best effort
    }
}

// Lazily load some modules that are only needed when an MCP server is actually started
const expressLazy = new Lazy(async () => await import('express'));
const mcpServerModuleLazy = new Lazy(async () => await import('@modelcontextprotocol/server'));
const mcpNodeModuleLazy = new Lazy(async () => await import('@modelcontextprotocol/node'));
