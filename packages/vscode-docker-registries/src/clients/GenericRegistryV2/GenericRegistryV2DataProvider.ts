/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RegistryV2DataProvider, V2Registry, V2RegistryItem, V2RegistryRoot } from '../RegistryV2/RegistryV2DataProvider';
import { BasicOAuthProvider } from '../../auth/BasicOAuthProvider';
import { GenericRegistryV2WizardContext, GenericRegistryV2WizardPromptStep } from './GenericRegistryV2WizardPromptStep';
import { RegistryWizard } from '../../wizard/RegistryWizard';
import { RegistryWizardSecretPromptStep, RegistryWizardUsernamePromptStep } from '../../wizard/RegistryWizardPromptStep';
import { isContextValueRegistryItem } from '../../contracts/RegistryItem';
import { CommonRegistryItem, isRegistry } from '../Common/models';

const GenericV2StorageKey = 'GenericV2ContainerRegistry';
const TrackedRegistriesKey = `${GenericV2StorageKey}.TrackedRegistries`;
const GenericV2ContextValue = 'generic';

export function isGenericV2Registry(item: unknown): item is V2Registry {
    return isRegistry(item) && isContextValueRegistryItem(item) && item.additionalContextValues?.includes(GenericV2ContextValue) === true;
}

export class GenericRegistryV2DataProvider extends RegistryV2DataProvider {
    public readonly id = 'vscode-docker.genericRegistryV2DataProvider';
    public readonly label = vscode.l10n.t('Generic Registry V2');
    public readonly description: undefined;
    public readonly iconPath = new vscode.ThemeIcon('link');

    private readonly authenticationProviders = new Map<string, BasicOAuthProvider>(); // The tree items are too short-lived to store the associated auth provider so keep a cache

    public constructor(private readonly extensionContext: vscode.ExtensionContext) {
        super();
    }

    public async onConnect(): Promise<void> {
        await this.addTrackedRegistry();
    }

    public async getChildren(element?: CommonRegistryItem | undefined): Promise<CommonRegistryItem[]> {
        const children = await super.getChildren(element);
        children.forEach(e => {
            e.additionalContextValues = [...(e.additionalContextValues || []), GenericV2ContextValue];
        });
        return children;
    }

    public getRoot(): V2RegistryRoot {
        return {
            parent: undefined,
            label: this.label,
            type: 'commonroot',
            iconPath: this.iconPath,
        };
    }

    public async getRegistries(root: V2RegistryRoot | V2RegistryItem): Promise<V2Registry[]> {
        const trackedRegistryStrings = this.extensionContext.globalState.get<string[]>(TrackedRegistriesKey, []);
        const trackedRegistries = trackedRegistryStrings.map(r => vscode.Uri.parse(r));

        return trackedRegistries.map(r => {
            return {
                label: r.toString(),
                parent: root,
                type: 'commonregistry',
                baseUrl: r
            };
        });
    }

    protected override getAuthenticationProvider(item: V2Registry): BasicOAuthProvider {
        const registry = item.baseUrl.toString();

        if (!this.authenticationProviders.has(registry)) {
            const provider = new BasicOAuthProvider(this.extensionContext.globalState, this.extensionContext.secrets, item.baseUrl);
            this.authenticationProviders.set(registry, provider);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.authenticationProviders.get(registry)!;
    }

    public async addTrackedRegistry(): Promise<void> {
        const wizardContext: GenericRegistryV2WizardContext = {
            registryPrompt: vscode.l10n.t('Registry URL'),
            registryPromptPlaceholder: vscode.l10n.t('http://localhost:5000'),
            usernamePrompt: vscode.l10n.t('Registry Username'),
            secretPrompt: vscode.l10n.t('Registry Password or Personal Access Token'),
            connectedRegistries: this.authenticationProviders ? [...this.authenticationProviders.keys()] : [],
        };

        const wizard = new RegistryWizard(
            wizardContext,
            [
                new GenericRegistryV2WizardPromptStep(),
                new RegistryWizardUsernamePromptStep(),
                new RegistryWizardSecretPromptStep(),
            ]
        );

        await wizard.prompt();

        if (!wizardContext.registryUri) {
            throw new Error('Registry URL is invalid');
        }

        const registryUriString = wizardContext.registryUri.toString().toLowerCase();

        // store registry url in memento
        const trackedRegistryStrings = this.extensionContext.globalState.get<string[]>(TrackedRegistriesKey, []);
        trackedRegistryStrings.push(registryUriString);
        await this.extensionContext.globalState.update(TrackedRegistriesKey, trackedRegistryStrings);

        // store credentials in auth provider
        const authProvider = new BasicOAuthProvider(this.extensionContext.globalState, this.extensionContext.secrets, wizardContext.registryUri);
        await authProvider.storeBasicCredentials(
            {
                username: wizardContext.username || '',
                secret: wizardContext.secret || '',
            }
        );
        this.authenticationProviders.set(registryUriString, authProvider);
    }

    public async removeTrackedRegistry(registry: V2Registry): Promise<void> {
        // remove registry url from list of tracked registries
        const registryUriString = registry.baseUrl.toString().toLowerCase();
        const trackedRegistryStrings = this.extensionContext.globalState.get<string[]>(TrackedRegistriesKey, []);
        const index = trackedRegistryStrings.findIndex(r => r === registryUriString);
        if (index !== -1) {
            trackedRegistryStrings.splice(index, 1);
            void this.extensionContext.globalState.update(TrackedRegistriesKey, trackedRegistryStrings);
        }

        // remove credentials from auth provider
        await this.authenticationProviders.get(registryUriString)?.removeSession();
        this.authenticationProviders.delete(registryUriString);
    }

    public hasTrackedRegistries(): boolean {
        const trackedRegistryStrings = this.extensionContext.globalState.get<string[]>(TrackedRegistriesKey, []);
        return trackedRegistryStrings.length > 0;
    }
}
