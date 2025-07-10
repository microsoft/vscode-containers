/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, registerCommand as registerCommandAzUI } from "@microsoft/vscode-azext-utils";
import { commands } from "vscode";
import { ext } from "../extensionVariables";
import { scaffold } from "../scaffolding/scaffold";
import { scaffoldCompose } from "../scaffolding/scaffoldCompose";
import { scaffoldDebugConfig } from "../scaffolding/scaffoldDebugConfig";
import { chooseContainerRuntime } from "./chooseContainerRuntime";
import { composeDown, composeDownSubset, composeRestart, composeUp, composeUpSubset } from "./compose/compose";
import { attachShellContainer } from "./containers/attachShellContainer";
import { browseContainer } from "./containers/browseContainer";
import { composeGroupDown, composeGroupLogs, composeGroupRestart, composeGroupStart, composeGroupStop } from "./containers/composeGroup";
import { configureContainersExplorer } from "./containers/configureContainersExplorer";
import { downloadContainerFile } from "./containers/files/downloadContainerFile";
import { openContainerFile } from "./containers/files/openContainerFile";
import { inspectContainer } from "./containers/inspectContainer";
import { pruneContainers } from "./containers/pruneContainers";
import { removeContainer } from "./containers/removeContainer";
import { removeContainerGroup } from "./containers/removeContainerGroup";
import { restartContainer } from "./containers/restartContainer";
import { selectContainer } from "./containers/selectContainer";
import { startContainer } from "./containers/startContainer";
import { stats } from "./containers/stats";
import { stopContainer } from "./containers/stopContainer";
import { viewContainerLogs } from "./containers/viewContainerLogs";
import { configureDockerContextsExplorer, dockerContextsHelp } from "./context/DockerContextsViewCommands";
import { inspectDockerContext } from "./context/inspectDockerContext";
import { removeDockerContext } from "./context/removeDockerContext";
import { useDockerContext } from "./context/useDockerContext";
import { help, reportIssue } from "./help";
import { buildImage } from "./images/buildImage";
import { configureImagesExplorer } from "./images/configureImagesExplorer";
import { copyFullTag } from "./images/copyFullTag";
import { inspectImage } from "./images/inspectImage";
import { pruneImages } from "./images/pruneImages";
import { pullImage } from "./images/pullImage";
import { pushImage } from "./images/pushImage/pushImage";
import { removeImage } from "./images/removeImage";
import { removeImageGroup } from "./images/removeImageGroup";
import { runAzureCliImage } from "./images/runAzureCliImage";
import { runImage, runImageInteractive } from "./images/runImage";
import { hideDanglingImages, setInitialDanglingContextValue, showDanglingImages } from "./images/showDanglingImages";
import { tagImage } from "./images/tagImage";
import { configureNetworksExplorer } from "./networks/configureNetworksExplorer";
import { createNetwork } from "./networks/createNetwork";
import { inspectNetwork } from "./networks/inspectNetwork";
import { pruneNetworks } from "./networks/pruneNetworks";
import { removeNetwork } from "./networks/removeNetwork";
import { openDockerDownloadPage } from "./openDockerDownloadPage";
import { pruneSystem } from "./pruneSystem";
import { registerWorkspaceCommand } from "./registerWorkspaceCommand";
import { createAzureRegistry } from "./registries/azure/createAzureRegistry";
import { deleteAzureRegistry } from "./registries/azure/deleteAzureRegistry";
import { deleteAzureRepository } from "./registries/azure/deleteAzureRepository";
import { deployImageToAca } from "./registries/azure/deployImageToAca";
import { deployImageToAzure } from "./registries/azure/deployImageToAzure";
import { openInAzurePortal } from "./registries/azure/openInAzurePortal";
import { buildImageInAzure } from "./registries/azure/tasks/buildImageInAzure";
import { untagAzureImage } from "./registries/azure/untagAzureImage";
import { viewAzureProperties } from "./registries/azure/viewAzureProperties";
import { connectRegistry } from "./registries/connectRegistry";
import { copyRemoteFullTag } from "./registries/copyRemoteFullTag";
import { copyRemoteImageDigest } from "./registries/copyRemoteImageDigest";
import { deleteRemoteImage } from "./registries/deleteRemoteImage";
import { disconnectRegistry } from "./registries/disconnectRegistry";
import { openDockerHubInBrowser } from "./registries/dockerHub/openDockerHubInBrowser";
import { addTrackedGenericV2Registry } from "./registries/genericV2/addTrackedGenericV2Registry";
import { removeTrackedGenericV2Registry } from "./registries/genericV2/removeTrackedGenericV2Registry";
import { inspectRemoteImageManifest } from "./registries/inspectRemoteImageManifest";
import { logInToDockerCli } from "./registries/logInToDockerCli";
import { logOutOfDockerCli } from "./registries/logOutOfDockerCli";
import { pullImageFromRepository, pullRepository } from "./registries/pullImages";
import { reconnectRegistry } from "./registries/reconnectRegistry";
import { registryHelp } from "./registries/registryHelp";
import { configureVolumesExplorer } from "./volumes/configureVolumesExplorer";
import { inspectVolume } from "./volumes/inspectVolume";
import { pruneVolumes } from "./volumes/pruneVolumes";
import { removeVolume } from "./volumes/removeVolume";

interface CommandReasonArgument {
    commandReason: 'tree' | 'palette' | 'install';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCommand(commandId: string, callback: (context: IActionContext, ...args: any[]) => any, debounce?: number): void {
    registerCommandAzUI(
        commandId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (context, ...args: any[]) => {
            void ext.activityMeasurementService.recordActivity('overallnoedit');

            // If a command reason is given, record it. Currently only the start page provides the reason.
            const commandReasonArgIndex = args.findIndex(a => (<CommandReasonArgument>a)?.commandReason);
            if (commandReasonArgIndex >= 0) {
                const commandReason = (<CommandReasonArgument>args[commandReasonArgIndex]).commandReason;
                context.telemetry.properties.commandReason = commandReason;
                if (commandReason === 'install') {
                    context.telemetry.properties.isActivationEvent = 'true';
                }

                // Remove the reason argument from the list to prevent confusing the command
                args.splice(commandReasonArgIndex, 1);
            }

            return callback(context, ...args);
        },
        debounce
    );
}

export function registerCommands(): void {
    registerWorkspaceCommand('vscode-containers.configure', scaffold);
    registerWorkspaceCommand('vscode-containers.configureCompose', scaffoldCompose);
    registerWorkspaceCommand('vscode-containers.debugging.initializeForDebugging', scaffoldDebugConfig);

    registerWorkspaceCommand('vscode-containers.compose.down', composeDown);
    registerWorkspaceCommand('vscode-containers.compose.restart', composeRestart);
    registerWorkspaceCommand('vscode-containers.compose.up', composeUp);
    registerWorkspaceCommand('vscode-containers.compose.up.subset', composeUpSubset);
    registerWorkspaceCommand('vscode-containers.compose.down.subset', composeDownSubset);
    registerCommand('vscode-containers.pruneSystem', pruneSystem);

    registerWorkspaceCommand('vscode-containers.containers.attachShell', attachShellContainer);
    registerCommand('vscode-containers.containers.browse', browseContainer);
    registerCommand('vscode-containers.containers.downloadFile', downloadContainerFile);
    registerCommand('vscode-containers.containers.inspect', inspectContainer);
    registerCommand('vscode-containers.containers.configureExplorer', configureContainersExplorer);
    registerCommand('vscode-containers.containers.openFile', openContainerFile);
    registerCommand('vscode-containers.containers.prune', pruneContainers);
    registerCommand('vscode-containers.containers.remove', removeContainer);
    registerCommand('vscode-containers.containers.group.remove', removeContainerGroup);
    registerCommand('vscode-containers.containers.restart', restartContainer);
    registerCommand('vscode-containers.containers.select', selectContainer);
    registerCommand('vscode-containers.containers.start', startContainer);
    registerCommand('vscode-containers.containers.stop', stopContainer);
    registerWorkspaceCommand('vscode-containers.containers.stats', stats);
    registerWorkspaceCommand('vscode-containers.containers.viewLogs', viewContainerLogs);
    registerWorkspaceCommand('vscode-containers.containers.composeGroup.logs', composeGroupLogs);
    registerWorkspaceCommand('vscode-containers.containers.composeGroup.start', composeGroupStart);
    registerWorkspaceCommand('vscode-containers.containers.composeGroup.stop', composeGroupStop);
    registerWorkspaceCommand('vscode-containers.containers.composeGroup.restart', composeGroupRestart);
    registerWorkspaceCommand('vscode-containers.containers.composeGroup.down', composeGroupDown);

    registerWorkspaceCommand('vscode-containers.images.build', buildImage);
    registerCommand('vscode-containers.images.configureExplorer', configureImagesExplorer);
    registerCommand('vscode-containers.images.inspect', inspectImage);
    registerCommand('vscode-containers.images.prune', pruneImages);
    registerCommand('vscode-containers.images.showDangling', showDanglingImages);
    registerCommand('vscode-containers.images.hideDangling', hideDanglingImages);
    setInitialDanglingContextValue();
    registerWorkspaceCommand('vscode-containers.images.pull', pullImage);
    registerWorkspaceCommand('vscode-containers.images.push', pushImage);
    registerCommand('vscode-containers.images.remove', removeImage);
    registerCommand('vscode-containers.images.group.remove', removeImageGroup);
    registerWorkspaceCommand('vscode-containers.images.run', runImage);
    registerWorkspaceCommand('vscode-containers.images.runAzureCli', runAzureCliImage);
    registerWorkspaceCommand('vscode-containers.images.runInteractive', runImageInteractive);
    registerCommand('vscode-containers.images.tag', tagImage);
    registerCommand('vscode-containers.images.copyFullTag', copyFullTag);

    registerCommand('vscode-containers.networks.configureExplorer', configureNetworksExplorer);
    registerCommand('vscode-containers.networks.create', createNetwork);
    registerCommand('vscode-containers.networks.inspect', inspectNetwork);
    registerCommand('vscode-containers.networks.remove', removeNetwork);
    registerCommand('vscode-containers.networks.prune', pruneNetworks);

    registerCommand('vscode-containers.registries.connectRegistry', connectRegistry);
    registerCommand('vscode-containers.registries.copyImageDigest', copyRemoteImageDigest);
    registerCommand('vscode-containers.registries.inspectRemoteImageManifest', inspectRemoteImageManifest);
    registerCommand('vscode-containers.registries.copyRemoteFullTag', copyRemoteFullTag);
    registerCommand('vscode-containers.registries.deleteImage', deleteRemoteImage);
    registerCommand('vscode-containers.registries.deployImageToAzure', deployImageToAzure);
    registerCommand('vscode-containers.registries.deployImageToAca', deployImageToAca);
    registerCommand('vscode-containers.registries.disconnectRegistry', disconnectRegistry);
    registerCommand('vscode-containers.registries.help', registryHelp);
    registerWorkspaceCommand('vscode-containers.registries.logInToContainerCli', logInToDockerCli);
    registerWorkspaceCommand('vscode-containers.registries.logOutOfContainerCli', logOutOfDockerCli);
    registerWorkspaceCommand('vscode-containers.registries.pullImage', pullImageFromRepository);
    registerWorkspaceCommand('vscode-containers.registries.pullRepository', pullRepository);
    registerCommand('vscode-containers.registries.reconnectRegistry', reconnectRegistry);

    registerCommand('vscode-containers.registries.genericV2.removeTrackedRegistry', removeTrackedGenericV2Registry);
    registerCommand('vscode-containers.registries.genericV2.addTrackedRegistry', addTrackedGenericV2Registry);

    registerCommand('vscode-containers.registries.dockerHub.openInBrowser', openDockerHubInBrowser);

    registerWorkspaceCommand('vscode-containers.registries.azure.buildImage', buildImageInAzure);
    registerCommand('vscode-containers.registries.azure.createRegistry', createAzureRegistry);
    registerCommand('vscode-containers.registries.azure.deleteRegistry', deleteAzureRegistry);
    registerCommand('vscode-containers.registries.azure.deleteRepository', deleteAzureRepository);
    registerCommand('vscode-containers.registries.azure.openInPortal', openInAzurePortal);
    registerCommand('vscode-containers.registries.azure.untagImage', untagAzureImage);
    registerCommand('vscode-containers.registries.azure.viewProperties', viewAzureProperties);

    registerCommand('vscode-containers.volumes.configureExplorer', configureVolumesExplorer);
    registerCommand('vscode-containers.volumes.inspect', inspectVolume);
    registerCommand('vscode-containers.volumes.prune', pruneVolumes);
    registerCommand('vscode-containers.volumes.remove', removeVolume);

    registerCommand('vscode-containers.contexts.configureExplorer', configureDockerContextsExplorer);
    registerCommand('vscode-containers.contexts.help', dockerContextsHelp);
    registerCommand('vscode-containers.contexts.inspect', inspectDockerContext);
    registerCommand('vscode-containers.contexts.remove', removeDockerContext);
    registerCommand('vscode-containers.contexts.use', useDockerContext);

    registerCommand('vscode-containers.openDockerDownloadPage', openDockerDownloadPage);
    registerCommand('vscode-containers.help', help);
    registerCommand('vscode-containers.help.openWalkthrough', () => commands.executeCommand('workbench.action.openWalkthrough', 'ms-azuretools.vscode-containers#containersStart'));
    registerCommand('vscode-containers.help.reportIssue', reportIssue);
    registerCommand('vscode-containers.chooseContainerRuntime', chooseContainerRuntime);

    registerCommand('vscode-containers.activateContainerRuntimeProviders', (context: IActionContext) => {
        // Do nothing, but container runtime provider extensions can use this command as an activation event
        context.telemetry.suppressAll = true;
        context.errorHandling.suppressDisplay = true;
    });
    registerCommand('vscode-containers.activateRegistryProviders', (context: IActionContext) => {
        // Do nothing, but registry provider extensions can use this command as an activation event
        context.telemetry.suppressAll = true;
        context.errorHandling.suppressDisplay = true;
    });
}
