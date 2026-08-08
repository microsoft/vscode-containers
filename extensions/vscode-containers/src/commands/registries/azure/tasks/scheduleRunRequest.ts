/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { DockerBuildRequest as AcrDockerBuildRequest, FileTaskRunRequest as AcrFileTaskRunRequest, OS as AcrOS, Run as AcrRun, ContainerRegistryManagementClient } from "@azure/arm-containerregistry"; // These are only dev-time imports so don't need to be lazy
import { AzureWizard, AzureWizardExecuteStep, AzureWizardPromptStep, createSubscriptionContext, IActionContext, IAzureQuickPickItem, nonNullProp, randomUtils } from '@microsoft/vscode-azext-utils';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import * as vscode from 'vscode';
import { CreatePickAcrPromptStep, PickAcrWizardContext } from '../../../images/pushImage/CreatePickAcrPromptStep';
import { ext } from '../../../../extensionVariables';
import { AzureRegistryItem } from "../../../../tree/registries/Azure/AzureRegistryDataProvider";
import { createArmContainerRegistryClient, getResourceGroupFromId } from "../../../../utils/azureUtils";
import { getStorageBlob, getTar } from '../../../../utils/lazyPackages';
import { delay } from '../../../../utils/promiseUtils';
import { Item, quickPickDockerFileItem, quickPickYamlFileItem } from '../../../../utils/quickPickFile';
import { quickPickWorkspaceFolder } from '../../../../utils/quickPickWorkspaceFolder';
import { subscriptionExperience } from "../../../../utils/registryExperience";
import { addImageTaggingTelemetry, getTagFromUserInput } from '../../../images/tagImage';

const vcsIgnoreList = ['.git', '.gitignore', '.bzr', 'bzrignore', '.hg', '.hgignore', '.svn'];

// this is used by the ms-kubernetes-tools.aks-devx-tools extension (https://github.com/Azure/aks-devx-tools)
export enum RootStrategy {
    Default = 'Default',
    DockerfileFolder = 'DockerfileFolder',
}

interface ScheduleRunRequestWizardContext extends PickAcrWizardContext {
    fileItem?: Item;
    getRun?: () => Promise<AcrRun>;
    imageName?: string;
    osType?: AcrOS;
    requestType: 'DockerBuildRequest' | 'FileTaskRunRequest';
    rootFolder?: vscode.WorkspaceFolder;
    rootStrategy?: RootStrategy;
    uri?: vscode.Uri;
}

export async function scheduleRunRequest(context: IActionContext, requestType: 'DockerBuildRequest' | 'FileTaskRunRequest', uri: vscode.Uri | undefined, rootStrategy?: RootStrategy | undefined): Promise<() => Promise<AcrRun>> {
    const wizardContext = context as ScheduleRunRequestWizardContext;
    wizardContext.requestType = requestType;
    wizardContext.uri = uri;
    wizardContext.rootStrategy = rootStrategy;

    const wizard = new AzureWizard(wizardContext, {
        promptSteps: [
            new SelectRequestFilesPromptStep(),
            new SelectSubscriptionPromptStep(),
            new CreatePickAcrPromptStep<ScheduleRunRequestWizardContext>(),
            new SelectOsTypePromptStep(),
        ],
        executeSteps: [
            new ScheduleRunRequestExecuteStep(),
        ],
        showLoadingPrompt: true,
    });

    await wizard.prompt();
    await wizard.execute();

    return nonNullProp(wizardContext, 'getRun');
}

class SelectRequestFilesPromptStep extends AzureWizardPromptStep<ScheduleRunRequestWizardContext> {
    public async prompt(wizardContext: ScheduleRunRequestWizardContext): Promise<void> {
        if (wizardContext.requestType === 'DockerBuildRequest') {
            wizardContext.rootFolder = await quickPickWorkspaceFolder(wizardContext, vscode.l10n.t('To quick build Dockerfiles you must first open a folder or workspace in VS Code.'));
            wizardContext.fileItem = await quickPickDockerFileItem(wizardContext, wizardContext.uri, wizardContext.rootFolder);
            wizardContext.imageName = await quickPickImageName(wizardContext, wizardContext.rootFolder, wizardContext.fileItem);
        } else if (wizardContext.requestType === 'FileTaskRunRequest') {
            wizardContext.rootFolder = await quickPickWorkspaceFolder(wizardContext, vscode.l10n.t('To run a task from a .yaml file you must first open a folder or workspace in VS Code.'));
            wizardContext.fileItem = await quickPickYamlFileItem(wizardContext, wizardContext.uri, wizardContext.rootFolder, vscode.l10n.t('To run a task from a .yaml file you must have yaml file in your VS Code workspace.'));
        } else {
            throw new Error(vscode.l10n.t('Run Request Type Currently not supported.'));
        }
    }

    public shouldPrompt(): boolean {
        return true;
    }
}

class SelectSubscriptionPromptStep extends AzureWizardPromptStep<ScheduleRunRequestWizardContext> {
    public async prompt(wizardContext: ScheduleRunRequestWizardContext): Promise<void> {
        wizardContext.azureSubscriptionNode = await subscriptionExperience(wizardContext);
    }

    public shouldPrompt(): boolean {
        return true;
    }
}

class SelectOsTypePromptStep extends AzureWizardPromptStep<ScheduleRunRequestWizardContext> {
    public async prompt(wizardContext: ScheduleRunRequestWizardContext): Promise<void> {
        const osPick = ['Linux', 'Windows'].map(item => <IAzureQuickPickItem<AcrOS>>{ label: item, data: item });
        wizardContext.osType = (await wizardContext.ui.showQuickPick(osPick, { placeHolder: vscode.l10n.t('Select image base OS') })).data;
    }

    public shouldPrompt(): boolean {
        return true;
    }
}

class ScheduleRunRequestExecuteStep extends AzureWizardExecuteStep<ScheduleRunRequestWizardContext> {
    public priority: number = 100;

    public async execute(wizardContext: ScheduleRunRequestWizardContext): Promise<void> {
        const rootFolder = nonNullProp(wizardContext, 'rootFolder');
        const fileItem = nonNullProp(wizardContext, 'fileItem');
        const osType = nonNullProp(wizardContext, 'osType');
        const connectedRegistry = nonNullProp(wizardContext, 'connectedRegistry');
        const registryItem: AzureRegistryItem = connectedRegistry.wrappedItem as AzureRegistryItem;
        const resourceGroup = getResourceGroupFromId(registryItem.id);
        const tarFilePath: string = getTempSourceArchivePath();

        try {
            // Prepare to run.
            ext.outputChannel.show();

            let rootUri = rootFolder.uri;
            if (wizardContext.rootStrategy === RootStrategy.DockerfileFolder) {
                // changes the root to the folder where the Dockerfile is
                // it is used by the ms-kubernetes-tools.aks-devx-tools extension (https://github.com/Azure/aks-devx-tools)
                rootUri = vscode.Uri.file(path.dirname(fileItem.absoluteFilePath));
            }

            const azureRegistryClient = await createArmContainerRegistryClient([wizardContext, createSubscriptionContext(registryItem.subscription)]);
            const uploadedSourceLocation: string = await uploadSourceCode(azureRegistryClient, registryItem.label, resourceGroup, rootUri, tarFilePath);
            ext.outputChannel.info(vscode.l10n.t('Uploaded source code from {0}', tarFilePath));

            let runRequest: AcrDockerBuildRequest | AcrFileTaskRunRequest;
            if (wizardContext.requestType === 'DockerBuildRequest') {
                runRequest = {
                    type: wizardContext.requestType,
                    imageNames: [nonNullProp(wizardContext, 'imageName')],
                    isPushEnabled: true,
                    sourceLocation: uploadedSourceLocation,
                    platform: { os: osType },
                    dockerFilePath: path.relative(rootUri.fsPath, fileItem.absoluteFilePath)
                };
            } else {
                runRequest = {
                    type: 'FileTaskRunRequest',
                    taskFilePath: path.relative(rootUri.fsPath, fileItem.absoluteFilePath),
                    sourceLocation: uploadedSourceLocation,
                    platform: { os: osType }
                };
            }

            // Schedule the run and Clean up.
            ext.outputChannel.info(vscode.l10n.t('Set up run request'));

            const run = await azureRegistryClient.registries.beginScheduleRunAndWait(resourceGroup, registryItem.label, runRequest);
            ext.outputChannel.info(vscode.l10n.t('Scheduled run {0}', run.runId));

            void streamLogs(wizardContext, registryItem, run);

            // function returns the AcrRun info
            wizardContext.getRun = async () => azureRegistryClient.runs.get(resourceGroup, registryItem.label, run.runId);
        } finally {
            if (await fse.pathExists(tarFilePath)) {
                await fse.unlink(tarFilePath);
            }
        }
    }

    public shouldExecute(): boolean {
        return true;
    }
}

async function quickPickImageName(context: IActionContext, rootFolder: vscode.WorkspaceFolder, dockerFileItem: Item | undefined): Promise<string> {
    const absFilePath: string = path.join(rootFolder.uri.fsPath, dockerFileItem.relativeFilePath);
    const dockerFileKey = `ACR_buildTag_${absFilePath}`;
    const prevImageName: string | undefined = ext.context.workspaceState.get(dockerFileKey);
    let suggestedImageName: string;

    if (!prevImageName) {
        // Get imageName based on name of subfolder containing the Dockerfile, or else workspacefolder
        suggestedImageName = path.basename(dockerFileItem.relativeFolderPath).toLowerCase();
        if (suggestedImageName === '.') {
            suggestedImageName = path.basename(rootFolder.uri.fsPath).toLowerCase().replace(/\s/g, '');
        }

        suggestedImageName += ":{{.Run.ID}}";
    } else {
        suggestedImageName = prevImageName;
    }

    // Temporary work-around for vscode bug where valueSelection can be messed up if a quick pick is followed by a showInputBox
    await delay(500);

    addImageTaggingTelemetry(context, suggestedImageName, '.before');
    const imageName: string = await getTagFromUserInput(context, suggestedImageName);
    addImageTaggingTelemetry(context, imageName, '.after');

    await ext.context.workspaceState.update(dockerFileKey, imageName);
    return imageName;
}

async function uploadSourceCode(client: ContainerRegistryManagementClient, registryName: string, resourceGroupName: string, rootFolder: vscode.Uri, tarFilePath: string): Promise<string> {
    const tar = await getTar();

    ext.outputChannel.info(vscode.l10n.t('   Sending source code to temp file'));
    const source: string = rootFolder.fsPath;
    let items = await fse.readdir(source);
    items = items.filter(i => !(i in vcsIgnoreList));
    tar.c({ cwd: source }, items).pipe(fse.createWriteStream(tarFilePath));

    ext.outputChannel.info(vscode.l10n.t('   Getting build source upload URL'));
    const sourceUploadLocation = await client.registries.getBuildSourceUploadUrl(resourceGroupName, registryName);
    const uploadUrl: string = sourceUploadLocation.uploadUrl;
    const relativePath: string = sourceUploadLocation.relativePath;

    const storageBlob = await getStorageBlob();
    const blobClient = new storageBlob.BlockBlobClient(uploadUrl);
    ext.outputChannel.info(vscode.l10n.t('   Creating block blob'));
    await blobClient.uploadFile(tarFilePath);

    return relativePath;
}

const blobCheckInterval = 1000;
const maxBlobChecks = 30;
async function streamLogs(context: IActionContext, registryItem: AzureRegistryItem, run: AcrRun): Promise<void> {
    const azureRegistryClient = await createArmContainerRegistryClient([context, createSubscriptionContext(registryItem.subscription)]);
    const resourceGroup = getResourceGroupFromId(registryItem.id);
    const result = await azureRegistryClient.runs.getLogSasUrl(resourceGroup, registryItem.label, run.runId);

    const storageBlob = await getStorageBlob();
    const blobClient = new storageBlob.BlobClient(nonNullProp(result, 'logLink'));

    // Start streaming the response to the output channel
    let byteOffset = 0;
    let totalChecks = 0;
    let exists = false;

    await new Promise<void>((resolve, reject) => {
        const timer = setInterval(
            async () => {
                try {
                    if (!exists && !(exists = await blobClient.exists())) {
                        totalChecks++;
                        if (totalChecks >= maxBlobChecks) {
                            clearInterval(timer);
                            reject('Not found');
                        }
                    }

                    const properties = await blobClient.getProperties();
                    if (properties.contentLength > byteOffset) {
                        // New data available
                        const response = await blobClient.download(byteOffset);
                        byteOffset += response.contentLength;

                        const lineReader = readline.createInterface(response.readableStreamBody);
                        for await (const line of lineReader) {
                            const sanitizedLine = line
                                // eslint-disable-next-line no-control-regex
                                .replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F]/g, ''); // Remove non-printing control characters
                            ext.outputChannel.info(sanitizedLine);
                        }
                    }

                    if (properties.metadata?.complete) {
                        clearInterval(timer);
                        resolve();
                    }
                } catch (err) {
                    clearInterval(timer);
                    reject(err);
                }
            },
            blobCheckInterval
        );
    });
}

function getTempSourceArchivePath(): string {
    const archive = `sourceArchive${randomUtils.getRandomHexString(8)}.tar.gz`;
    ext.outputChannel.info(vscode.l10n.t('Setting up temp file with \'{0}\'', archive));
    const tarFilePath: string = path.join(os.tmpdir(), archive);
    return tarFilePath;
}
