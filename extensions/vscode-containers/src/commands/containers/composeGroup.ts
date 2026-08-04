/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import { CommonOrchestratorCommandOptions, IContainerOrchestratorClient, LogsCommandOptions, VoidCommandResponse } from '@microsoft/vscode-container-client';
import * as path from 'path';
import { l10n, Uri, workspace } from 'vscode';
import { ext } from '../../extensionVariables';
import { TaskCommandRunnerFactory } from '../../runtimes/runners/TaskCommandRunnerFactory';
import { ComposeProfileGroupTreeItem } from '../../tree/containers/ComposeProfileGroupTreeItem';
import { ContainerGroupTreeItem } from '../../tree/containers/ContainerGroupTreeItem';
import { ContainerTreeItem } from '../../tree/containers/ContainerTreeItem';
import { selectComposeLogsCommand } from '../selectCommandTemplate';

type ComposeGroupNode = ContainerGroupTreeItem | ComposeProfileGroupTreeItem;

export async function composeGroupLogs(context: IActionContext, node: ComposeGroupNode): Promise<void> {
    return composeGroup<LogsCommandOptions>(context, async (client, options) => {
        const labels = await getComposeGroupLabels(node);
        const workingDirectory = labels && getComposeWorkingDirectory(labels);

        if (!workingDirectory) {
            context.errorHandling.suppressReportIssue = true;
            throw new Error(l10n.t('Unable to determine compose project info for group \'{0}\'.', getProjectLabel(node)));
        }

        const folder = workspace.getWorkspaceFolder(Uri.file(workingDirectory)) ?? Uri.file(workingDirectory);

        const composeFilesString = options.files?.map(file => `-f "${file}"`).join(' ');
        return selectComposeLogsCommand(context, folder, composeFilesString, options.projectName, options.environmentFile);
    }, node, 'logs', { follow: true, tail: 1000 });
}

export async function composeGroupStart(context: IActionContext, node: ComposeGroupNode): Promise<void> {
    return composeGroup(context, (client, options) => client.start(options), node, 'start');
}

export async function composeGroupStop(context: IActionContext, node: ComposeGroupNode): Promise<void> {
    return composeGroup(context, (client, options) => client.stop(options), node, 'stop');
}

export async function composeGroupRestart(context: IActionContext, node: ComposeGroupNode): Promise<void> {
    return composeGroup(context, (client, options) => client.restart(options), node, 'restart');
}

export async function composeGroupDown(context: IActionContext, node: ComposeGroupNode): Promise<void> {
    return composeGroup(context, (client, options) => client.down(options), node, 'down');
}

type AdditionalOptions<TOptions extends CommonOrchestratorCommandOptions> = Omit<TOptions, keyof CommonOrchestratorCommandOptions>;

async function composeGroup<TOptions extends CommonOrchestratorCommandOptions>(
    context: IActionContext,
    composeCommandCallback: (client: IContainerOrchestratorClient, options: TOptions) => Promise<VoidCommandResponse>,
    node: ComposeGroupNode,
    commandName: string = '<command>',
    additionalOptions?: AdditionalOptions<TOptions>
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
        throw new Error(l10n.t('Unable to determine compose project info for group \'{0}\'.', getProjectLabel(node)));
    }

    let profileArg: string[] | undefined;
    let servicesArg: string[] | undefined;

    if (node instanceof ComposeProfileGroupTreeItem && node.profileName) {
        // Ask the user whether to apply the command with the profile flag (which includes default
        // services too), only to the explicit service names in this profile (excluding defaults),
        // or strictly to services exclusive to this profile.
        const scope = await pickComposeProfileCommandScope(context, node, commandName);
        if (scope === 'profile') {
            // Use --profile flag: command affects both this profile's services AND default services
            profileArg = [node.profileName];
        } else if (scope === 'exclusive') {
            // Use explicit service list for EXCLUSIVE services only
            servicesArg = node.getExclusiveServiceNames();
            if (servicesArg.length === 0) {
                context.errorHandling.suppressReportIssue = true;
                throw new Error(l10n.t('There are no services exclusive to the "{0}" profile.', node.label));
            }
        } else {
            // Use explicit service list: command affects only the services belonging to this profile
            servicesArg = node.getServiceNames();
        }
    }

    const options: TOptions = {
        files: orchestratorFiles,
        projectName: projectName,
        environmentFile: envFile,
        ...(profileArg ? { profiles: profileArg } : {}),
        ...(servicesArg?.length ? { services: servicesArg } : {}),
        ...additionalOptions,
    } as TOptions;

    const client = await ext.orchestratorManager.getClient();
    const taskCRF = new TaskCommandRunnerFactory({
        taskName: client.displayName,
        cwd: workingDirectory,
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
// Exported only for unit testing; not intended to be called outside this module.
export function getProjectLabel(node: ComposeGroupNode): string {
    if (node instanceof ComposeProfileGroupTreeItem && node.parent?.label) {
        return node.parent.label;
    }
    return node.label;
}

// Exported only for unit testing; not intended to be called outside this module.
export function findContainerWithComposeConfig(node: ComposeGroupNode): ContainerTreeItem | undefined {
    // Find a container in the group that carries the compose project config files label.
    // For ComposeProfileGroupTreeItem the direct children are ContainerTreeItem instances.
    // For ContainerGroupTreeItem with profile sub-groups the direct children may be
    // ComposeProfileGroupTreeItem instances, so we search one level deeper in that case.
    let container = (node.ChildTreeItems as ContainerTreeItem[])
        .find(c => c instanceof ContainerTreeItem && c.labels?.['com.docker.compose.project.config_files']) as ContainerTreeItem | undefined;

    if (!container && node instanceof ContainerGroupTreeItem) {
        // ContainerGroupTreeItem may have ComposeProfileGroupTreeItem children; search their children too
        for (const child of node.ChildTreeItems) {
            if (child instanceof ComposeProfileGroupTreeItem) {
                container = (child.ChildTreeItems as ContainerTreeItem[])
                    .find(c => c instanceof ContainerTreeItem && c.labels?.['com.docker.compose.project.config_files']) as ContainerTreeItem | undefined;
                if (container) {
                    break;
                }
            }
        }
    }

    return container;
}

async function getComposeGroupLabels(node: ComposeGroupNode): Promise<{ [key: string]: string } | undefined> {
    const container = findContainerWithComposeConfig(node);
    if (!container) {
        return undefined;
    }

    const inspectResult = await ext.runWithDefaults(client =>
        client.inspectContainers({ containers: [container.containerId] })
    );

    return inspectResult?.[0]?.labels;
}

/**
 * Prompts the user to choose how the compose action should apply to a profile.
 * Returns 'profile' to use the --profile flag (includes default services too),
 * 'services' to apply only to the specific services in this profile,
 * or 'exclusive' to apply only to services that belong strictly to this profile.
 */
async function pickComposeProfileCommandScope(context: IActionContext, node: ComposeProfileGroupTreeItem, commandName: string): Promise<'profile' | 'services' | 'exclusive'> {
    const exclusiveNames = node.getExclusiveServiceNames();

    const picks: IAzureQuickPickItem<'profile' | 'services' | 'exclusive'>[] = [
        {
            label: l10n.t('Apply to this profile and default services'),
            description: l10n.t('Runs: docker compose --profile {0} {1}', node.label, commandName),
            data: 'profile'
        },
        {
            label: l10n.t('Apply only to services in this profile'),
            description: l10n.t('Runs: docker compose {0} {1}', commandName, node.getServiceNames().join(' ')),
            data: 'services'
        },
        {
            label: l10n.t('Apply only to exclusive services'),
            description: exclusiveNames.length
                ? l10n.t('Runs: docker compose {0} {1}', commandName, exclusiveNames.join(' '))
                : l10n.t('No services are exclusive to this profile'),
            data: 'exclusive'
        },
    ];

    const selection = await context.ui.showQuickPick(picks, {
        placeHolder: l10n.t('How should this compose action apply to profile "{0}"?', node.label),
    });

    return selection.data;
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
