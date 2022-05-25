/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, ExtensionContext, ThemeIcon } from "vscode";
import { RepositoryV2 } from "./RepositoryV2";
import { RegistryV2CatalogResponseBody, RegistryV2Response } from "./utils/RegistryV2Responses";
import { registryV2Request, getOAuthTokenFromBasic, AuthContext, getAuthContext } from "./utils/registryV2Request";
import { RegistryV2ProviderBase } from "./RegistryV2ProviderBase";
import { Request } from "node-fetch";
import { CachingRegistryBase, CachingRegistryState } from "../CachingProvider/CachingRegistryBase";
import { DockerCredentials } from "../contracts/DockerCredentials";
import { URL } from "url";

const invalidImagePathParts = /\w+:\/\/|\/v2|\/$/ig;
const catalogScope = 'registry:catalog:*';

/**
 * State specific to `RegistryV2` implementations
 */
export interface RegistryV2State extends CachingRegistryState {
    /**
     * True if the registry is a monolith (public), false otherwise
     */
    isMonolith: boolean;

    /**
     * If the registry is a monolith (public), this contains the list of connected repositories,
     * allowing the `_catalog` endpoint to be skipped. It will always be defined if isMonolith
     * is true.
     */
    monolithRepositories?: string[];
}

/**
 * Registry implementation for generic V2 registries
 */
export class RegistryV2 extends CachingRegistryBase<RegistryV2State> {
    /**
     * The OAuth context (undefined until a basic auth request is refused)
     */
    protected authContext: AuthContext | undefined;

    // @inheritdoc
    public get contextValue(): string {
        if (this.isMonolith) {
            return 'RegistryV2;Monolith;';
        }

        return 'RegistryV2;';
    }

    // @inheritdoc
    public get iconPath(): ThemeIcon {
        // Loading is done this way to avoid needing anything more than @types/vscode
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const themeIcon: new (id: string) => ThemeIcon = require('vscode').ThemeIcon;
        return new themeIcon('server-environment');
    }

    // @inheritdoc
    public get label(): string {
        return this.baseImagePath;
    }

    // @inheritdoc
    public get baseImagePath(): string {
        return this.state.service.replace(invalidImagePathParts, '').toLowerCase();
    }

    /**
     * Gets the registry URL
     */
    public get registryUrl(): URL {
        return new URL(this.state.service);
    }

    /**
     * Whether the registry is a monolith (public) or not (private)
     */
    public get isMonolith(): boolean {
        return this.state.isMonolith;
    }

    /**
     * For monolith registries, adds a specific repository to the list of connected ones
     * @param repositoryName The name of the repository to add
     */
    public async connectMonolithRepository(repositoryName: string): Promise<void> {
        if (!this.isMonolith) {
            throw new Error('Cannot add monolith repository to non-monolith registry.');
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (this.state.monolithRepositories!.some(r => r === repositoryName)) {
            throw new Error(`Cannot add monolith repository '${repositoryName}' because it is already added.`);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const monolithRepositories = this.state.monolithRepositories!;
        monolithRepositories.push(repositoryName);
        await this.setState({ ...this.state, monolithRepositories: monolithRepositories });
    }

    /**
     * For monolith registries, removes a specific repository from the list of connected ones
     * @param repositoryName The name of the repository to remove
     */
    public async disconnectMonolithRepository(repositoryName: string): Promise<void> {
        if (!this.isMonolith) {
            throw new Error('Cannot remove monolith repository from non-monolith registry.');
        }

        let monolithRepositories = this.state.monolithRepositories ?? [];
        monolithRepositories = monolithRepositories.filter(r => r.toLowerCase() !== repositoryName.toLowerCase());
        await this.setState({ ...this.state, monolithRepositories: monolithRepositories });
    }

    /**
     * Signs an HTTP request with the necessary authorization header. If OAuth is enabled, this gets the token first.
     * @param request The request to sign
     * @param scope The OAuth scope of the request
     * @param cancelToken Cancellation token
     */
    public async signRequest(request: Request, scope: string, cancelToken: CancellationToken): Promise<void> {
        if (!this.authContext) {
            return this.signRequestBasic(request, cancelToken);
        }

        const oAuthToken = await getOAuthTokenFromBasic(this, this.authContext, scope, cancelToken);
        request.headers.set('Authorization', `Bearer ${oAuthToken}`);
    }

    /**
     * Signs an HTTP request with basic auth only.
     * @param request The request to sign
     * @param cancelToken Cancellation token
     * @internal
     */
    public async signRequestBasic(request: Request, cancelToken: CancellationToken): Promise<void> {
        const creds = await this.getDockerLoginCredentials(cancelToken);
        const buffer = Buffer.from(`${creds.account}:${creds.secret}`);

        const basicAuthHeader = `Basic ${buffer.toString('base64')}`;

        request.headers.set('Authorization', basicAuthHeader);
    }

    /**
     * Connects a new generic V2 registry
     * @param parent The parent registry provider
     * @param registryId The registry ID
     * @param extensionContext Extension context provided at activation
     * @param credentials The service and credentials for the registry
     * @param isMonolith True if using a monolith, false otherwise
     * @param monolithRepositories If using a monolith, the list of monolith repositories of interest
     */
    public static async connect(parent: RegistryV2ProviderBase, registryId: string, extensionContext: ExtensionContext, credentials: DockerCredentials, isMonolith: boolean, monolithRepositories?: string[]): Promise<RegistryV2> {
        if (!isMonolith && monolithRepositories) {
            throw new Error('Cannot create a non-monolith registry with monolith repositories.');
        }

        const state: RegistryV2State = {
            service: credentials.service,
            account: credentials.account,
            isMonolith: isMonolith,
            monolithRepositories: isMonolith ? monolithRepositories ?? [] : undefined,
        };

        const registry = new RegistryV2(parent, registryId, extensionContext);
        await registry.setState(state);
        await extensionContext.secrets.store(registry.secretStoreKey, credentials.secret);

        return registry;
    }

    // @inheritdoc
    protected async getRepositoriesImpl(token: CancellationToken): Promise<RepositoryV2[]> {
        if (this.isMonolith) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return (this.state.monolithRepositories!).map(r => new RepositoryV2(this, r));
        } else {
            let response: RegistryV2Response<RegistryV2CatalogResponseBody> = await registryV2Request('GET', this, '_catalog', catalogScope, token, false);

            if (!response.succeeded && response.status === 401) {
                // Try again with OAuth
                this.authContext = getAuthContext(response);
                response = await registryV2Request('GET', this, '_catalog', catalogScope, token);
            }

            if (response.succeeded) {
                return response.body.repositories.map(r => new RepositoryV2(this, r));
            } else {
                throw new Error(`Failed to get repositories. Status Code: ${response.status}, Status: ${response.statusText}, Errors: ${response.body?.errors}`);
            }
        }
    }
}
