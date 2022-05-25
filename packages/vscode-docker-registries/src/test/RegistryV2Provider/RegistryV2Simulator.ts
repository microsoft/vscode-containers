/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import { Disposable } from "vscode";
import { URL } from 'url';

export const digest = 'sha256:baadf00d';
export const created = '2020-01-01';

const tagsRegExp = /v2\/(?<image>[\w-/]+)\/tags\/list/i;
const manifestsRegExp = /v2\/(?<image>[\w-/]+)\/manifests\/(?<reference>[\w:]+)/i;

export class RegistryV2Simulator implements Disposable {
    private readonly authServer: http.Server;
    private readonly registryServer: http.Server;
    private oAuth = false;

    public readonly cache: { [key: string]: { tag: string; digest: string }[] } = { 'myimage': [{ tag: 'latest', digest: digest }] };
    public catalogCalled = false;

    public constructor(public readonly registryPort: number, public readonly authPort: number, private readonly disableCatalog: boolean) {
        this.authServer = this.createAuthServer();
        this.registryServer = this.createRegistryServer();
    }

    public get registry(): string {
        return this.registryUrl.host;
    }

    public get registryUrl(): URL {
        return new URL(`http://localhost:${this.registryPort}/v2`);
    }

    public get registryId(): string {
        return this.registryPort.toString();
    }

    public startListening(): void {
        this.registryServer.listen(this.registryPort, 'localhost');
        this.authServer.listen(this.authPort, 'localhost');
    }

    public dispose(): void {
        this.authServer?.close();
        this.registryServer?.close();
    }

    public requireOAuth(): void {
        this.oAuth = true;
    }

    private createRegistryServer(): http.Server {
        return http.createServer((request, response) => {
            let statusCode = 404;
            let statusMessage = 'Not found';
            let body: string | undefined;

            let image: string | undefined;
            let reference: string | undefined;
            const tagsMatch = request.url?.match(tagsRegExp);
            const manifestsMatch = request.url?.match(manifestsRegExp);

            // Enforce silly auth
            if (!request.headers.authorization ||
                (this.oAuth && request.headers.authorization !== 'Bearer silly')) {
                statusCode = 401;
                statusMessage = 'Unauthorized';

                if (this.oAuth) {
                    response.setHeader('www-authenticate', `Bearer realm="http://localhost:${this.authPort}",service="${this.registry}"`);
                }
            }
            // Version check
            else if (request.url === '/v2/') {
                statusCode = 200;
                statusMessage = 'OK';
            }
            // Catalog
            else if (request.url === '/v2/_catalog' && !this.disableCatalog) {
                this.catalogCalled = true;
                statusCode = 200;
                statusMessage = 'OK';
                body = JSON.stringify({ repositories: Object.keys(this.cache) });
            }
            // Tag list
            else if ((image = tagsMatch?.[1]) && this.cache[image]) {
                statusCode = 200;
                statusMessage = 'OK';
                body = JSON.stringify({ name: image, tags: this.cache[image].map(i => i.tag) });
            }
            // Manifest or delete
            else if ((image = manifestsMatch?.[1]) && (reference = manifestsMatch?.[2])) {
                const tag = this.cache[image].find(i => i.digest === reference || i.tag === reference);

                if (tag && request.method === 'DELETE' && tag.digest === reference) {
                    this.cache[image] = this.cache[image].filter(i => i.digest !== reference);
                    statusCode = 202;
                    statusMessage = 'Accepted';
                } else if (tag && request.method === 'GET') {
                    statusCode = 200;
                    statusMessage = 'OK';
                    body = JSON.stringify({
                        name: image,
                        tag: tag.tag,
                        history: [{ v1Compatibility: JSON.stringify({ created: created }) }],
                    });
                    response.setHeader('Docker-Content-Digest', tag.digest);
                }
            }

            response.statusCode = statusCode;
            response.statusMessage = statusMessage;

            if (body) {
                response.setHeader('Content-Length', body.length);
                response.setHeader('Content-Type', 'application/json');
                response.write(body);
            }
            response.end();
            return;
        });
    }

    private createAuthServer(): http.Server {
        return http.createServer((request, response) => {
            response.write(JSON.stringify({ token: 'silly' }));
            response.end();
        });
    }
}
