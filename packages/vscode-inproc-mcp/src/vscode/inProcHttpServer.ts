/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ServerType } from '@hono/node-server';
import type { DisposableLike } from '@microsoft/vscode-processutils';
import * as crypto from 'crypto';
import * as fs from 'fs';
import type { AddressInfo, ListenOptions } from 'net';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getErrorMessage } from '../utils/getErrorMessage';
import { Lazy } from '../utils/Lazy';
import type { McpProviderOptions } from './McpProviderOptions';

type SessionTransport = {
    handleRequest: (req: Request, options?: { parsedBody?: unknown }) => Promise<Response>;
    close: () => Promise<void>;
};

/**
 * Starts a new MCP HTTP server instance on loopback TCP, a random named pipe (Windows), or a Unix socket (Unix).
 * @param mcpOptions Options for the MCP server
 * @returns An object containing the disposable to stop and clean up the server, the server URI, and headers
 * that should be attached to all requests
 */
export async function startInProcHttpServer(mcpOptions: McpProviderOptions): Promise<{ disposable: DisposableLike, serverUri: vscode.Uri, headers: Record<string, string> }> {
    let socketPath: string | undefined;
    const transports: Record<string, SessionTransport> = {};

    mcpOptions.transport ??= 'ipc';

    try {
        const nonce = crypto.randomUUID();

        const [{ Hono }, { createAdaptorServer }] = await Promise.all([
            honoModuleLazy.value,
            honoNodeServerModuleLazy.value,
        ]);

        const app = new Hono();
        let allowedHost: string | undefined;

        // Routes have to be registered before the server starts, so use this function to read this lazily after the OS has had a chance to assign any port.
        function getAllowedHost(): string {
            if (!allowedHost) {
                throw new Error('The MCP HTTP server has not finished binding.');
            }
            return allowedHost;
        };

        app.use('/mcp', async (context, next) => {
            if (mcpOptions.transport === 'tcp') {
                // Require the exact Host as an extra precaution to prevent DNS rebinding. This endpoint
                // supports only non-browser MCP clients, so reject any request with an Origin.
                if (context.req.header('host') !== getAllowedHost() || context.req.header('origin')) {
                    return new Response('Forbidden', { status: 403 });
                }
            }

            if (context.req.header('authorization') !== `Nonce ${nonce}`) {
                return new Response('Unauthorized', { status: 401 });
            }

            return await next();
        });

        app.post('/mcp', async (context) => await handlePost(mcpOptions, transports, getAllowedHost(), context.req.raw));
        app.get('/mcp', async (context) => await handleGetDelete(transports, context.req.raw));
        app.delete('/mcp', async (context) => await handleGetDelete(transports, context.req.raw));

        const httpServer = createAdaptorServer({
            fetch: app.fetch,
            overrideGlobalObjects: false,
        });

        if (mcpOptions.transport === 'tcp') {
            await listen(httpServer, { host: '127.0.0.1', port: 0 });
            allowedHost = getLoopbackAuthority(httpServer.address());
        } else {
            socketPath = getRandomSocketPath();
            await listen(httpServer, socketPath);
            allowedHost = 'localhost';
        }

        const serverUri = mcpOptions.transport === 'tcp' ?
            vscode.Uri.from({
                scheme: 'http',
                authority: getAllowedHost(),
                path: '/mcp',
            }) :
            vscode.Uri.from({
                scheme: os.platform() === 'win32' ? 'pipe' : 'unix',
                path: socketPath,
                fragment: '/mcp',
            });

        return {
            disposable: {
                dispose: () => {
                    // Clean up all transports
                    for (const sessionId in transports) {
                        void transports[sessionId].close();
                        delete transports[sessionId];
                    }

                    // Close the Hono server
                    if (httpServer.listening) {
                        httpServer.close();
                    }

                    // Clean up the socket path
                    tryCleanupSocket(socketPath);
                }
            },
            serverUri,
            headers: {
                'Authorization': `Nonce ${nonce}`,
            },
        };
    } catch (err) {
        tryCleanupSocket(socketPath);
        throw err;
    }
}

async function handlePost(mcpOptions: McpProviderOptions, transports: Record<string, SessionTransport>, allowedHost: string, request: Request): Promise<Response> {
    const sessionId = getSessionId(request);
    const { isInitializeRequest, McpServer, WebStandardStreamableHTTPServerTransport } = await mcpServerModuleLazy.value;

    let transport: SessionTransport;
    let parsedBody: unknown;

    if (sessionId && transports[sessionId]) {
        // Existing session
        transport = transports[sessionId];
    } else if (!sessionId) {
        const parseResult = await parseJsonBody(request);
        if ('errorResponse' in parseResult) {
            return parseResult.errorResponse;
        }

        parsedBody = parseResult.parsedBody;
        if (!isInitializeRequest(parsedBody)) {
            // Invalid request
            return createJsonRpcErrorResponse(400, 'Bad Request: No valid session ID provided');
        }

        // New session initialization request
        transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (sessionId) => {
                transports[sessionId] = transport;
            },
            onsessionclosed: (sessionId) => {
                delete transports[sessionId];
            },
            enableDnsRebindingProtection: true,
            allowedHosts: [allowedHost],
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
            return createJsonRpcErrorResponse(500, `Failed to register MCP tools: ${getErrorMessage(err)}`);
        }

        await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
    } else {
        // Invalid request
        return createJsonRpcErrorResponse(400, 'Bad Request: No valid session ID provided');
    }

    return await transport.handleRequest(request, parsedBody === undefined ? undefined : { parsedBody });
}

async function handleGetDelete(transports: Record<string, SessionTransport>, request: Request): Promise<Response> {
    const sessionId = getSessionId(request);

    if (!sessionId || !transports[sessionId]) {
        return new Response('Invalid or missing session ID', { status: 400 });
    }

    const transport = transports[sessionId];
    return await transport.handleRequest(request);
}

/**
 * Starts the server and resolves after it has bound to its address.
 * Use this instead of calling `httpServer.listen` directly when the OS assigns the TCP port,
 * because `httpServer.listen` returns before that port is available.
 */
function listen(httpServer: ServerType, options: ListenOptions | string): Promise<void> {
    return new Promise((resolve, reject) => {
        const onError = (err: Error): void => reject(err);
        const onListening = (): void => {
            httpServer.off('error', onError);
            resolve();
        };

        httpServer.once('error', onError);
        httpServer.listen(options, onListening);
    });
}

function getLoopbackAuthority(address: string | AddressInfo | null): string {
    if (!address || typeof address === 'string') {
        throw new Error('The loopback HTTP server did not expose a TCP address.');
    }
    return `127.0.0.1:${address.port}`;
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

function getSessionId(request: Request): string | undefined {
    return request.headers.get('mcp-session-id') ?? undefined;
}

function createJsonRpcErrorResponse(status: number, message: string): Response {
    return Response.json({
        jsonrpc: '2.0',
        error: {
            code: -32000,
            message,
        },
        id: null,
    }, { status });
}

async function parseJsonBody(request: Request): Promise<{ parsedBody: unknown } | { errorResponse: Response }> {
    try {
        const parsedBody: unknown = await request.clone().json();
        return { parsedBody };
    } catch {
        return { errorResponse: createJsonRpcErrorResponse(400, 'Bad Request: Invalid JSON body') };
    }
}

// Lazily load some modules that are only needed when an MCP server is actually started
const honoModuleLazy = new Lazy(async () => await import('hono'));
const honoNodeServerModuleLazy = new Lazy(async () => await import('@hono/node-server'));
const mcpServerModuleLazy = new Lazy(async () => await import('@modelcontextprotocol/server'));
