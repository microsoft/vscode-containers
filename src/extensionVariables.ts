/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtTreeDataProvider, AzExtTreeItem, IExperimentationServiceAdapter } from '@microsoft/vscode-azext-utils';
import { DockerHubRegistryDataProvider, GenericRegistryV2DataProvider, GitHubRegistryDataProvider } from '@microsoft/vscode-docker-registries';
import { ExtensionContext, StatusBarItem, TreeView } from 'vscode';
import { ContainerRuntimeManager } from './runtimes/ContainerRuntimeManager';
import { ExecutionEnvironmentManager } from './runtimes/ExecutionEnvironmentManager';
import { OrchestratorRuntimeManager } from './runtimes/OrchestratorRuntimeManager';
import { runWithDefaults as runWithDefaultsImpl, streamWithDefaults as streamWithDefaultsImpl } from './runtimes/runners/runWithDefaults';
import { IActivityMeasurementService } from './telemetry/ActivityMeasurementService';
import { ContainersTreeItem } from './tree/containers/ContainersTreeItem';
import { ContextsTreeItem } from './tree/contexts/ContextsTreeItem';
import { ImagesTreeItem } from './tree/images/ImagesTreeItem';
import { NetworksTreeItem } from './tree/networks/NetworksTreeItem';
import { AzureRegistryDataProvider } from './tree/registries/Azure/AzureRegistryDataProvider';
import { UnifiedRegistryItem, UnifiedRegistryTreeDataProvider } from './tree/registries/UnifiedRegistryTreeDataProvider';
import { VolumesTreeItem } from './tree/volumes/VolumesTreeItem';
import { AzExtLogOutputChannelWrapper } from './utils/AzExtLogOutputChannelWrapper';

/**
 * Namespace for common variables used throughout the extension. They must be initialized in the activate() method of extension.ts
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ext {
    export let context: ExtensionContext;
    export let outputChannel: AzExtLogOutputChannelWrapper;

    export let experimentationService: IExperimentationServiceAdapter;
    export let activityMeasurementService: IActivityMeasurementService;

    export let treeInitError: unknown;

    export let imagesTree: AzExtTreeDataProvider;
    export let imagesTreeView: TreeView<AzExtTreeItem>;
    export let imagesRoot: ImagesTreeItem;

    export let containersTree: AzExtTreeDataProvider;
    export let containersTreeView: TreeView<AzExtTreeItem>;
    export let containersRoot: ContainersTreeItem;

    export let networksTree: AzExtTreeDataProvider;
    export let networksTreeView: TreeView<AzExtTreeItem>;
    export let networksRoot: NetworksTreeItem;

    export const prefix: string = 'containers';

    export let registriesTree: UnifiedRegistryTreeDataProvider;
    export let registriesTreeView: TreeView<UnifiedRegistryItem<unknown>>;
    export let registriesRoot: UnifiedRegistryTreeDataProvider;
    export let genericRegistryV2DataProvider: GenericRegistryV2DataProvider;
    export let azureRegistryDataProvider: AzureRegistryDataProvider;
    export let dockerHubRegistryDataProvider: DockerHubRegistryDataProvider;
    export let githubRegistryDataProvider: GitHubRegistryDataProvider;

    export let volumesTree: AzExtTreeDataProvider;
    export let volumesTreeView: TreeView<AzExtTreeItem>;
    export let volumesRoot: VolumesTreeItem;

    export let contextsTree: AzExtTreeDataProvider;
    export let contextsTreeView: TreeView<AzExtTreeItem>;
    export let contextsRoot: ContextsTreeItem;

    // Container runtime related items
    export let runtimeManager: ContainerRuntimeManager;
    export let orchestratorManager: OrchestratorRuntimeManager;
    export let executionManger: ExecutionEnvironmentManager;
    export const runWithDefaults = runWithDefaultsImpl;
    export const streamWithDefaults = streamWithDefaultsImpl;

    export let dockerContextStatusBarItem: StatusBarItem;
}
