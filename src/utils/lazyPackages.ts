/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ext } from '../extensionVariables';
import { Lazy } from './lazy';

const armAuthLazy = new Lazy(async () => await import('@azure/arm-authorization'));
export async function getArmAuth() {
    return await armAuthLazy.value;
}

const armContainerRegistryLazy = new Lazy(async () => await import('@azure/arm-containerregistry'));
export async function getArmContainerRegistry() {
    return await armContainerRegistryLazy.value;
}

const storageBlobLazy = new Lazy(async () => await import('@azure/storage-blob'));
export async function getStorageBlob() {
    return await storageBlobLazy.value;
}

const handlebarsLazy = new Lazy(async () => await import('handlebars'));
export async function getHandlebars() {
    return await handlebarsLazy.value;
}

const languageClientLazy = new Lazy(async () => {
    const module = await import('vscode-languageclient/node');
    // The module is CJS; when bundled to ESM by esbuild the exports end up on `default`. Fall back to the module itself for unbundled usage.
    return (module as unknown as typeof module & { default?: typeof module }).default ?? module;
});
export async function getLanguageClient() {
    return await languageClientLazy.value;
}

// This file is really most important for these next two functions, which ensure that the extension variables are registered before the package is used
const azExtAzureUtilsLazy = new Lazy(async () => {
    const azExtAzureUtils = await import('@microsoft/vscode-azext-azureutils');
    azExtAzureUtils.registerAzureUtilsExtensionVariables(ext);
    return azExtAzureUtils;
});
export async function getAzExtAzureUtils() {
    return await azExtAzureUtilsLazy.value;
}

const azExtAppServiceLazy = new Lazy(async () => {
    const appSvc = await import('@microsoft/vscode-azext-azureappservice');
    appSvc.registerAppServiceExtensionVariables(ext);
    return appSvc;
});
export async function getAzExtAppService() {
    return await azExtAppServiceLazy.value;
}
