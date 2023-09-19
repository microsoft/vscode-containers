/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CommonRegistryDataProvider } from '../Common/CommonRegistryDataProvider';
import { CommonRegistry, CommonRegistryItem, CommonRegistryRoot, CommonRepository, CommonTag } from '../Common/models';
import { AuthenticationProvider } from '../../contracts/AuthenticationProvider';
import { LoginInformation } from '../../contracts/BasicCredentials';
import { registryV2Request } from './registryV2Request';
import { getNextLinkFromHeaders } from '../../utils/httpRequest';

export type V2RegistryItem = CommonRegistryItem;
export type V2RegistryRoot = CommonRegistryRoot;
export type V2Registry = CommonRegistry & V2RegistryItem;
export type V2Repository = CommonRepository & V2RegistryItem;
export type V2Tag = CommonTag & V2RegistryItem;

export abstract class RegistryV2DataProvider extends CommonRegistryDataProvider {
    public getRoot(): V2RegistryRoot {
        return {
            parent: undefined,
            label: this.label,
            type: 'commonroot',
            iconPath: this.iconPath,
        };
    }

    public abstract getRegistries(root: V2RegistryRoot | V2RegistryItem): V2Registry[] | Promise<V2Registry[]>;

    public async getRepositories(registry: V2Registry): Promise<V2Repository[]> {
        const results: V2Repository[] = [];
        let nextLink: vscode.Uri | undefined = registry.baseUrl.with({ path: 'v2/_catalog' });
        do {
            const catalogResponse = await registryV2Request<{ repositories: string[] }>({
                authenticationProvider: this.getAuthenticationProvider(registry),
                method: 'GET',
                requestUri: nextLink,
                scopes: ['registry:catalog:*'],
            });

            for (const repository of catalogResponse.body?.repositories || []) {
                results.push({
                    parent: registry,
                    baseUrl: registry.baseUrl,
                    label: repository,
                    type: 'commonrepository',
                });
            }

            nextLink = getNextLinkFromHeaders(catalogResponse.headers, registry.baseUrl);
        } while (nextLink);

        return results;
    }

    public async getTags(repository: V2Repository): Promise<V2Tag[]> {
        const results: V2Tag[] = [];
        let nextLink: vscode.Uri | undefined = repository.baseUrl.with({ path: `v2/${repository.label}/tags/list` });

        do {
            const tagsResponse = await registryV2Request<{ tags: string[] }>({
                authenticationProvider: this.getAuthenticationProvider(repository),
                method: 'GET',
                requestUri: nextLink,
                scopes: [`repository:${repository.label}:pull`],
                throwOnFailure: true,
            });

            for (const tag of tagsResponse.body?.tags || []) {
                results.push({
                    parent: repository,
                    baseUrl: repository.baseUrl,
                    label: tag,
                    type: 'commontag',
                    additionalContextValues: ['registryV2Tag'],
                });
            }

            nextLink = getNextLinkFromHeaders(tagsResponse.headers, repository.baseUrl);
        } while (nextLink);

        // Asynchronously begin getting the created date details for each tag
        results.forEach(tag => {
            this.getTagCreatedDate(repository, tag.label).then((createdAt) => {
                tag.createdAt = createdAt;
                this.onDidChangeTreeDataEmitter.fire(tag);
            }, () => { /* Best effort */ });
        });

        return results;
    }

    public getLoginInformation(item: V2RegistryItem): Promise<LoginInformation> {
        const authenticationProvider = this.getAuthenticationProvider(item);
        if (authenticationProvider.getLoginInformation) {
            return authenticationProvider.getLoginInformation();
        }

        throw new Error(vscode.l10n.t('Authentication provider {0} does not support getting login information.', authenticationProvider));
    }

    public async deleteTag(item: CommonTag): Promise<void> {
        const digest = await this.getImageDigest(item);
        const registry = item.parent.parent as unknown as V2Registry;
        const requestUrl = registry.baseUrl.with({ path: `v2/${item.parent.label}/manifests/${digest}` });
        await registryV2Request({
            authenticationProvider: this.getAuthenticationProvider(registry),
            method: 'DELETE',
            requestUri: requestUrl,
            scopes: [`repository:${item.parent.label}:delete`]
        });
    }

    public async getImageDigest(item: CommonTag): Promise<string> {
        const registry = item.parent.parent as unknown as V2Registry;
        const requestUrl = registry.baseUrl.with({ path: `v2/${item.parent.label}/manifests/${item.label}` });

        const response = await registryV2Request({
            authenticationProvider: this.getAuthenticationProvider(registry),
            method: 'GET',
            requestUri: requestUrl,
            scopes: [`repository:${item.parent.label}:pull`],
            headers: {
                'accept': 'application/vnd.docker.distribution.manifest.v2+json'
            }
        });

        const digest = response.headers['docker-content-digest'];
        if (!digest) {
            throw new Error('Could not find digest');
        }

        return digest;
    }

    protected async getTagCreatedDate(repository: V2Repository, tag: string): Promise<Date | undefined> {
        const requestUrl = repository.baseUrl.with({ path: `v2/${repository.label}/manifests/${tag}` });

        const tagDetailResponse = await registryV2Request<Manifest>({
            authenticationProvider: this.getAuthenticationProvider(repository),
            method: 'GET',
            requestUri: requestUrl,
            scopes: [`repository:${repository.label}:pull`]
        });

        const history = <ManifestHistoryV1Compatibility>JSON.parse(tagDetailResponse.body?.history?.[0]?.v1Compatibility || '{}');
        return history?.created ? new Date(history.created) : undefined;
    }

    protected abstract getAuthenticationProvider(item: V2RegistryItem): AuthenticationProvider<never>;
}

interface ManifestHistory {
    v1Compatibility: string; // stringified ManifestHistoryV1Compatibility
}

interface ManifestHistoryV1Compatibility {
    created: string;
}

interface Manifest {
    history: ManifestHistory[];
}
