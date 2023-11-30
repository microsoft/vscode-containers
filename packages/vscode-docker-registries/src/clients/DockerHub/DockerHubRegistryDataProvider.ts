/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerHubAuthProvider } from '../../auth/DockerHubAuthProvider';
import { BasicCredentials, LoginInformation } from '../../contracts/BasicCredentials';
import { isContextValueRegistryItem } from '../../contracts/RegistryItem';
import { getNextLinkFromHeaders, httpRequest } from '../../utils/httpRequest';
import { RegistryWizard } from '../../wizard/RegistryWizard';
import { RegistryWizardContext } from '../../wizard/RegistryWizardContext';
import { RegistryWizardRequiredUsernamePromptStep, RegistryWizardSecretPromptStep } from '../../wizard/RegistryWizardPromptStep';
import { CommonRegistryDataProvider } from '../Common/CommonRegistryDataProvider';
import { CommonRegistryRoot, CommonRegistry, CommonRepository, CommonTag, CommonRegistryItem, isRegistry, isRepository } from '../Common/models';

import * as vscode from 'vscode';

export const DockerHubRequestUrl = vscode.Uri.parse('https://hub.docker.com/');
export const DockerHubRegistryUrl = vscode.Uri.parse('https://docker.io/');
export const DockerHubSignInUrl = 'https://index.docker.io/v1/';
export const DockerHubContextValue = 'dockerhub';

export function isDockerHubRegistry(item: unknown): item is CommonRegistry {
    return isRegistry(item) && isContextValueRegistryItem(item) && item.additionalContextValues?.includes(DockerHubContextValue) === true;
}

export function isDockerHubRepository(item: unknown): item is CommonRepository {
    return isRepository(item) && isContextValueRegistryItem(item) && item.additionalContextValues?.includes(DockerHubContextValue) === true;
}

export class DockerHubRegistryDataProvider extends CommonRegistryDataProvider {
    public readonly id = 'vscode-docker.dockerHub';
    public readonly label = vscode.l10n.t('Docker Hub');
    public readonly description: undefined;
    public readonly iconPath: { light: vscode.Uri, dark: vscode.Uri };

    private readonly authenticationProvider: DockerHubAuthProvider;

    public constructor(extensionContext: vscode.ExtensionContext) {
        super();
        this.authenticationProvider = new DockerHubAuthProvider(extensionContext.globalState, extensionContext.secrets);
        this.iconPath = {
            light: vscode.Uri.joinPath(extensionContext.extensionUri, 'resources', 'light', 'docker.svg'),
            dark: vscode.Uri.joinPath(extensionContext.extensionUri, 'resources', 'dark', 'docker.svg'),
        };
    }

    public async onConnect(): Promise<void> {
        const wizardContext: RegistryWizardContext = {
            usernamePrompt: vscode.l10n.t('Docker Hub Username'),
            secretPrompt: vscode.l10n.t('Docker Hub Password or Personal Access Token (requires `Read & Write` permissions)'),
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

    public async getChildren(element?: CommonRegistryItem | undefined): Promise<CommonRegistryItem[]> {
        const children = await super.getChildren(element);
        children.forEach(child => {
            child.additionalContextValues = [...(child.additionalContextValues || []), DockerHubContextValue];
        });
        return children;
    }

    public getRoot(): CommonRegistryRoot {
        return {
            parent: undefined,
            label: this.label,
            iconPath: this.iconPath,
            type: 'commonroot',
            baseUrl: DockerHubRegistryUrl
        };
    }

    public async getRegistries(root: CommonRegistryRoot): Promise<CommonRegistry[]> {
        const orgsAndNamespaces = new Set<string>();

        (await this.getOrganizations()).forEach(org => orgsAndNamespaces.add(org));
        (await this.getNamespaces()).forEach(namespace => orgsAndNamespaces.add(namespace));

        const results: CommonRegistry[] = [];

        const sortedOrgsAndNamespaces = Array.from(orgsAndNamespaces).sort();

        for (const orgOrNamespace of sortedOrgsAndNamespaces) {
            results.push({
                parent: root,
                label: orgOrNamespace,
                type: 'commonregistry',
                baseUrl: DockerHubRegistryUrl,
            });
        }

        return results;
    }

    public async getRepositories(registry: CommonRegistry): Promise<CommonRepository[]> {
        const results: CommonRepository[] = [];
        let requestUrl: vscode.Uri | undefined = DockerHubRequestUrl
            .with({ path: `v2/repositories/${registry.label}` });

        do {
            const response = await httpRequest<{ results: [{ name: string; }] }>(requestUrl.toString(), {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${(await this.authenticationProvider.getSession([], {})).accessToken}`,
                }
            });

            for (const repository of (await response.json()).results) {
                results.push({
                    parent: registry,
                    label: `${repository.name}`,
                    type: 'commonrepository',
                    baseUrl: registry.baseUrl,
                });
            }

            requestUrl = getNextLinkFromHeaders(response.headers, registry.baseUrl);
        } while (requestUrl);

        return results;
    }

    public async getTags(repository: CommonRepository): Promise<CommonTag[]> {
        const results: CommonTag[] = [];
        let requestUrl: vscode.Uri | undefined = DockerHubRequestUrl
            .with({ path: `v2/repositories/${repository.parent.label}/${repository.label}/tags` });

        do {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const response = await httpRequest<{ results: [{ name: string, last_updated: string }] }>(requestUrl.toString(), {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${(await this.authenticationProvider.getSession([], {})).accessToken}`,
                }
            });

            for (const tag of (await response.json()).results) {
                results.push({
                    parent: repository,
                    label: tag.name,
                    type: 'commontag',
                    createdAt: new Date(tag.last_updated || ''),
                    baseUrl: repository.baseUrl,
                });
            }

            requestUrl = getNextLinkFromHeaders(response.headers, repository.baseUrl);
        } while (requestUrl);

        return results;
    }

    public async getLoginInformation(item: CommonRegistryItem): Promise<LoginInformation> {
        return await this.authenticationProvider.getLoginInformation();
    }

    private async getNamespaces(): Promise<string[]> {
        const requestUrl = DockerHubRequestUrl
            .with({ path: `v2/repositories/namespaces` });

        const response = await httpRequest<{ namespaces: string[] }>(requestUrl.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${(await this.authenticationProvider.getSession([], {})).accessToken}`,
            }
        });

        return (await response.json()).namespaces || [];
    }

    private async getOrganizations(): Promise<string[]> {
        const requestUrl = DockerHubRequestUrl
            .with({ path: `v2/user/orgs` });

        const response = await httpRequest<{ results: [{ orgname: string }] }>(requestUrl.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${(await this.authenticationProvider.getSession([], {})).accessToken}`,
            }
        });

        return (await response.json()).results.map(org => org.orgname) || [];
    }
}
