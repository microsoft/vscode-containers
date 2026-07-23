/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import { CommonOrchestratorCommandOptions, IContainerOrchestratorClient, LogsCommandOptions, VoidCommandResponse } from '@microsoft/vscode-container-client';
import * as path from 'path';
import { l10n } from 'vscode';
import { ext } from '../../extensionVariables';
import { TaskCommandRunnerFactory } from '../../runtimes/runners/TaskCommandRunnerFactory';
import { ContainerGroupTreeItem } from '../../tree/containers/ContainerGroupTreeItem';
import { ContainerTreeItem } from '../../tree/containers/ContainerTreeItem';

export async function composeGroupLogs(context: IActionContext, node: ContainerGroupTreeItem): Promise<void> {
    // Since we're not interested in the output, we can pretend this is a `VoidCommandResponse`
    return composeGroup<LogsCommandOptions>(context, (client, options) => client.logs(options) as Promise<VoidCommandResponse>, node, { follow: true, tail: 1000 });
}

export async function composeGroupStart(context: IActionContext, node: ContainerGroupTreeItem): Promise<void> {
    return composeGroup(context, (client, options) => client.start(options), node, undefined, true);
}

export async function composeGroupStop(context: IActionContext, node: ContainerGroupTreeItem): Promise<void> {
    return composeGroup(context, (client, options) => client.stop(options), node, undefined, true);
}

export async function composeGroupRestart(context: IActionContext, node: ContainerGroupTreeItem): Promise<void> {
    return composeGroup(context, (client, options) => client.restart(options), node, undefined, true);
}

export async function composeGroupDown(context: IActionContext, node: ContainerGroupTreeItem): Promise<void> {
    return composeGroup(context, (client, options) => client.down(options), node, undefined, true);
}

type AdditionalOptions<TOptions extends CommonOrchestratorCommandOptions> = Omit<TOptions, keyof CommonOrchestratorCommandOptions>;

async function composeGroup<TOptions extends CommonOrchestratorCommandOptions>(
    context: IActionContext,
    composeCommandCallback: (client: IContainerOrchestratorClient, options: TOptions) => Promise<VoidCommandResponse>,
    node: ContainerGroupTreeItem,
    additionalOptions?: AdditionalOptions<TOptions>,
    close?: boolean
): Promise<void> {
    if (!node) {
        await ext.containersTree.refresh(context);
        node = await ext.containersTree.showTreeItemPicker<ContainerGroupTreeItem>(/composeGroup$/i, {
            ...context,
            noItemFoundErrorMessage: l10n.t('No compose projects are running.'),
        });
    }

    const labels = await getComposeGroupLabels(node);

    const workingDirectory = labels && getComposeWorkingDirectory(labels);
    const orchestratorFiles = labels && getComposeFiles(labels);
    const projectName = labels && getComposeProjectName(labels);
    const envFile = labels && getComposeEnvFile(labels);

    if (!workingDirectory || !orchestratorFiles || !projectName) {
        context.errorHandling.suppressReportIssue = true;
        throw new Error(l10n.t('Unable to determine compose project info for container group \'{0}\'.', node.label));
    }

    const options: TOptions = {
        files: orchestratorFiles,
        projectName: projectName,
        environmentFile: envFile,
        ...additionalOptions,
    } as TOptions;

    const client = await ext.orchestratorManager.getClient();
    const taskCRF = new TaskCommandRunnerFactory({
        taskName: client.displayName,
        cwd: workingDirectory,
        ...(close !== undefined && { close }),
    });

    await taskCRF.getCommandRunner()(composeCommandCallback(client, options));
}

/**
 * Gets the accurate label map for a compose container group.
 *
 * The tree's list-derived labels (from `docker container ls`) join all labels into
 * a single comma-separated string with no escaping, which corrupts any label *value*
 * that itself contains commas--most importantly `com.docker.compose.project.config_files`
 * when a project was started with multiple `-f` files. The label *keys* survive that
 * parsing, so we can still locate a container in the group from the list labels, but we
 * must `inspect` it to recover the accurate, verbatim label values (compose files, etc).
 */
async function getComposeGroupLabels(node: ContainerGroupTreeItem): Promise<{ [key: string]: string } | undefined> {
    // Find a container in the group that carries the compose project config files label
    const container = (node.ChildTreeItems as ContainerTreeItem[]).find(c => c.labels?.['com.docker.compose.project.config_files']);

    if (!container) {
        return undefined;
    }

    const inspectResult = await ext.runWithDefaults(client =>
        client.inspectContainers({ containers: [container.containerId] })
    );

    return inspectResult?.[0]?.labels;
}

// Exported only for unit testing; not intended to be called outside this module.
export function getComposeWorkingDirectory(labels: { [key: string]: string }): string | undefined {
    // The `com.docker.compose.project.working_dir` label gives the working directory in which to execute the compose command
    return labels['com.docker.compose.project.working_dir'] || undefined;
}

// Exported only for unit testing; not intended to be called outside this module.
export function getComposeFiles(labels: { [key: string]: string }): string[] | undefined {
    // The `com.docker.compose.project.config_files` label gives all the compose files (within the working directory) used to up this container

    // Paths may be subpaths, but working dir generally always directly contains the config files, so unless the file is already absolute, let's cut off the subfolder and get just the file name
    // (In short, the working dir may not be the same as the cwd when the docker-compose up command was called, BUT the files are relative to that cwd)
    // Note, it appears compose v2 *always* uses absolute paths, both for this and `working_dir`
    return labels['com.docker.compose.project.config_files']
        ?.split(',')
        ?.map(f => path.isAbsolute(f) ? f : path.parse(f).base);
}

// Exported only for unit testing; not intended to be called outside this module.
export function getComposeProjectName(labels: { [key: string]: string }): string | undefined {
    // The `com.docker.compose.project` label gives the project name
    return labels['com.docker.compose.project'] || undefined;
}

// Exported only for unit testing; not intended to be called outside this module.
export function getComposeEnvFile(labels: { [key: string]: string }): string | undefined {
    // The `com.docker.compose.project.environment_file` label gives the environment file absolute path
    return labels['com.docker.compose.project.environment_file'] || undefined;
}
