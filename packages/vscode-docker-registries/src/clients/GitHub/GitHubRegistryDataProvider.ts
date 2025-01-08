/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BasicOAuthProvider } from '../../auth/BasicOAuthProvider';
import { RegistryV2DataProvider, V2Registry, V2RegistryItem, V2RegistryRoot, V2Repository, V2Tag } from '../RegistryV2/RegistryV2DataProvider';
import { registryV2Request } from '../RegistryV2/registryV2Request';
import { AuthenticationProvider } from '../../contracts/AuthenticationProvider';
import { httpRequest } from '../../utils/httpRequest';
import { RegistryWizardContext } from '../../wizard/RegistryWizardContext';
import { RegistryWizard } from '../../wizard/RegistryWizard';
import { RegistryWizardRequiredUsernamePromptStep, RegistryWizardSecretPromptStep } from '../../wizard/RegistryWizardPromptStep';
import { BasicCredentials } from '../../contracts/BasicCredentials';
import { CommonRegistryItem, isRegistry } from '../Common/models';
import { isContextValueRegistryItem } from '../../contracts/RegistryItem';

const GitHubContainerRegistryUri = vscode.Uri.parse('https://ghcr.io');
const GitHubContextValue = 'github';

export function isGitHubRegistry(item: unknown): item is V2Registry {
    return isRegistry(item) && isContextValueRegistryItem(item) && item.additionalContextValues?.includes(GitHubContextValue) === true;
}

export class GitHubRegistryDataProvider extends RegistryV2DataProvider {
    public readonly id = 'vscode-docker.githubContainerRegistry';
    public readonly label = vscode.l10n.t('GitHub');
    public readonly description = vscode.l10n.t('GitHub Container Registry');
    public readonly iconPath: vscode.ThemeIcon = new vscode.ThemeIcon('github');

    private readonly authenticationProvider: BasicOAuthProvider;

    public constructor(private readonly extensionContext: vscode.ExtensionContext) {
        super();

        this.authenticationProvider = new BasicOAuthProvider(extensionContext.globalState, extensionContext.secrets, GitHubContainerRegistryUri);
    }

    public async onConnect(): Promise<void> {
        const wizardContext: RegistryWizardContext = {
            usernamePrompt: vscode.l10n.t('GitHub Username'),
            secretPrompt: vscode.l10n.t('GitHub Personal Access Token (requires `repo` and `write:packages` scopes)'),
        };

        const wizard = new RegistryWizard(
            wizardContext,
            [
                new RegistryWizardRequiredUsernamePromptStep(),
                new RegistryWizardSecretPromptStep(),
            ]
        );

        await wizard.prompt();
        const credentials: BasicCredentials = {
            username: wizardContext.username || '',
            secret: wizardContext.secret || '',
        };

        await this.authenticationProvider.storeBasicCredentials(credentials);
    }

    public async onDisconnect(): Promise<void> {
        await this.authenticationProvider.removeSession();
    }

    public override async getChildren(element?: CommonRegistryItem | undefined): Promise<CommonRegistryItem[]> {
        const children = await super.getChildren(element);
        children.forEach(e => {
            e.additionalContextValues = [...(e.additionalContextValues || []), GitHubContextValue];
        });
        return children;
    }

    public override async getRegistries(root: V2RegistryRoot): Promise<V2Registry[]> {
        const organizations = await this.getOrganizations();

        return organizations.map(org => (
            {
                parent: root,
                baseUrl: GitHubContainerRegistryUri,
                label: org,
                type: 'commonregistry'
            }
        ));
    }

    // TODO: GitHub's catalog endpoint uses standard paging, so this could be simplified to call super.getRepositories with just the added query parameter for the last repository name
    public override async getRepositories(registry: V2Registry): Promise<V2Repository[]> {
        const originalSearchString = registry.label + '/';
        const requestUrl = registry.baseUrl.with({ path: 'v2/_catalog' });

        const results: V2Repository[] = [];
        let nextSearchString = originalSearchString;
        let foundAllInSearch = false;

        do {
            const catalogResponse = await registryV2Request<{ repositories: string[] }>({
                authenticationProvider: this.authenticationProvider,
                method: 'GET',
                requestUri: requestUrl.with({ query: new URLSearchParams({ n: '100', last: nextSearchString }).toString() }),
                scopes: ['registry:catalog:*'],
                throwOnFailure: true,
            });

            for (const repository of catalogResponse.body?.repositories || []) {
                if (!repository.startsWith(originalSearchString)) {
                    foundAllInSearch = true;
                    break;
                } else {
                    nextSearchString = repository;
                }

                results.push({
                    parent: registry,
                    baseUrl: registry.baseUrl,
                    label: repository.toLowerCase(), // GHCR in particular allows uppercase letters in repository names which is not actually valid. Need to throw them all to lowercase. See https://github.com/microsoft/vscode-docker/issues/4419
                    type: 'commonrepository',
                });
            }
        } while (!foundAllInSearch);

        return results;
    }

    protected getAuthenticationProvider(item: V2RegistryItem): AuthenticationProvider<never> {
        return this.authenticationProvider;
    }

    protected override async getTagCreatedDate(item: V2Tag): Promise<Date | undefined> {
        const repository = item.parent as V2Repository;
        const tagRequestUrl = repository.baseUrl.with({ path: `v2/${repository.label}/manifests/${item.label}` });

        const tagDetailResponse = await registryV2Request<Blob>({
            authenticationProvider: this.getAuthenticationProvider(repository),
            method: 'GET',
            requestUri: tagRequestUrl,
            scopes: [`repository:${repository.label}:pull`]
        });

        const digest = tagDetailResponse.body?.config?.digest || '';
        const digestRequestUrl = repository.baseUrl.with({ path: `v2/${repository.label}/blobs/${digest}` });
        if (digest) {
            const configFile = await registryV2Request<{ created: string }>({
                authenticationProvider: this.getAuthenticationProvider(repository),
                method: 'GET',
                requestUri: digestRequestUrl,
                scopes: [`repository:${repository.label}:pull`]
            });

            return configFile.body?.created ? new Date(configFile.body.created) : undefined;
        }

        return undefined;
    }

    private async getOrganizations(): Promise<string[]> {
        const results: string[] = [];

        const creds = await this.authenticationProvider.getBasicCredentials();
        results.push(creds.username);

        const requestUrl = vscode.Uri.parse('https://api.github.com/user/orgs');
        const response = await httpRequest<{ login: string }[]>(requestUrl.toString(), {
            headers: {
                'Accept': 'application/vnd.github+json',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'X-GitHub-Api-Version': '2022-11-28',
                'Authorization': `Bearer ${creds.secret}`
            }
        });

        for (const org of await response.json()) {
            results.push(org.login.toLowerCase()); // GHCR allows uppercase letters in organization names which leads to invalid repository names. Need to throw them all to lowercase. See https://github.com/microsoft/vscode-docker/issues/4419
        }

        return results;
    }
}

interface Config {
    digest: string;
}

interface Blob {
    config: Config;
}
