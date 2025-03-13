/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TelemetryEvent } from '@microsoft/compose-language-service/lib/client/TelemetryEvent';
import { callWithTelemetryAndErrorHandling, createExperimentationService, IActionContext, registerErrorHandler, registerEvent, registerUIExtensionVariables, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import * as semver from 'semver';
import * as vscode from 'vscode';
import { ConfigurationParams, DidChangeConfigurationNotification, DocumentSelector, LanguageClient, LanguageClientOptions, Middleware, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import * as tas from 'vscode-tas-client';
import { registerCommands } from './commands/registerCommands';
import { configPrefix } from './constants';
import { registerDebugProvider } from './debugging/DebugHelper';
import { DockerExtensionApi } from './DockerExtensionApi';
import { DockerfileCompletionItemProvider } from './dockerfileCompletionItemProvider';
import { ext } from './extensionVariables';
import { AutoConfigurableDockerClient } from './runtimes/clients/AutoConfigurableDockerClient';
import { AutoConfigurableDockerComposeClient } from './runtimes/clients/AutoConfigurableDockerComposeClient';
import { AutoConfigurablePodmanClient } from './runtimes/clients/AutoConfigurablePodmanClient';
import { ContainerRuntimeManager } from './runtimes/ContainerRuntimeManager';
import { ContainerFilesProvider } from './runtimes/files/ContainerFilesProvider';
import { OrchestratorRuntimeManager } from './runtimes/OrchestratorRuntimeManager';
import { registerTaskProviders } from './tasks/TaskHelper';
import { ActivityMeasurementService } from './telemetry/ActivityMeasurementService';
import { registerFileListeners } from './telemetry/registerFileListeners';
import { registerRuntimeTelemetryHandler } from './telemetry/registerRuntimeTelemetryHandler';
import { registerTrees } from './tree/registerTrees';
import { AlternateYamlLanguageServiceClientFeature } from './utils/AlternateYamlLanguageServiceClientFeature';
import { AzExtLogOutputChannelWrapper } from './utils/AzExtLogOutputChannelWrapper';
import { logDockerEnvironment, logSystemInfo } from './utils/diagnostics';
import { DocumentSettingsClientFeature } from './utils/DocumentSettingsClientFeature';
import { migrateDockerToContainersSettingsIfNeeded } from './utils/migration/settings';
import { registerDockerContextStatusBarEvent } from './utils/registerDockerContextStatusBarItems';

export type KeyInfo = { [keyName: string]: string };

export interface ComposeVersionKeys {
    all: KeyInfo;
    v1: KeyInfo;
    v2: KeyInfo;
}

let dockerfileLanguageClient: LanguageClient;
let composeLanguageClient: LanguageClient;

const DOCUMENT_SELECTOR: DocumentSelector = [
    { language: 'dockerfile', scheme: 'file' }
];


function initializeExtensionVariables(ctx: vscode.ExtensionContext): void {
    ext.context = ctx;

    ext.outputChannel = new AzExtLogOutputChannelWrapper(vscode.window.createOutputChannel('Container Tools', { log: true }), ext.prefix);
    ctx.subscriptions.push(ext.outputChannel);

    registerUIExtensionVariables(ext);
}

export async function activateInternal(ctx: vscode.ExtensionContext, perfStats: { loadStartTime: number, loadEndTime: number | undefined }): Promise<unknown | undefined> {
    perfStats.loadEndTime = Date.now();

    initializeExtensionVariables(ctx);

    await callWithTelemetryAndErrorHandling('vscode-containers.activate', async (activateContext: IActionContext) => {
        activateContext.errorHandling.rethrow = true;
        activateContext.telemetry.properties.isActivationEvent = 'true';
        activateContext.telemetry.measurements.mainFileLoad = (perfStats.loadEndTime - perfStats.loadStartTime) / 1000;

        // Bail out of activation if old versions of the Docker extension are present
        const dockerExtension = vscode.extensions.getExtension('ms-azuretools.vscode-docker');
        if (dockerExtension && (dockerExtension.packageJSON as { version: string }).version) {
            const dockerExtensionVersion = semver.coerce(dockerExtension.packageJSON.version);
            if (dockerExtensionVersion && semver.lt(dockerExtensionVersion, '2.0.0')) {
                activateContext.errorHandling.suppressReportIssue = true;
                throw new Error(vscode.l10n.t('An unsupported version of the Docker extension is installed. Please update the Docker extension to version 2.0.0 or later. The Container Tools extension will not activate.'));
            }
        }

        // All of these internally handle telemetry opt-in
        ext.activityMeasurementService = new ActivityMeasurementService(ctx.globalState);
        ext.experimentationService = await createExperimentationService(
            ctx,
            process.env.VSCODE_DOCKER_TEAM === '1' ? tas.TargetPopulation.Team : undefined // If VSCODE_DOCKER_TEAM isn't set, let @microsoft/vscode-azext-utils decide target population
        );

        logSystemInfo(ext.outputChannel);

        // Disabled for now
        // (new SurveyManager()).activate();

        // Remove the "Report Issue" button from all error messages in favor of the command
        registerErrorHandler(ctx => ctx.errorHandling.suppressReportIssue = true);

        // Set up Dockerfile completion provider
        ctx.subscriptions.push(
            vscode.languages.registerCompletionItemProvider(
                DOCUMENT_SELECTOR,
                new DockerfileCompletionItemProvider(),
                '.'
            )
        );

        // Set up environment variables
        registerEnvironmentVariableContributions();

        // Set up runtime managers
        ctx.subscriptions.push(
            ext.runtimeManager = new ContainerRuntimeManager(),
            ext.orchestratorManager = new OrchestratorRuntimeManager()
        );

        // Set up Docker clients
        registerDockerClients();

        // Set up container filesystem provider
        ctx.subscriptions.push(
            vscode.workspace.registerFileSystemProvider(
                'containers',
                new ContainerFilesProvider(),
                {
                    // While Windows containers aren't generally case-sensitive, Linux containers are and make up the overwhelming majority of running containers.
                    isCaseSensitive: true,
                    isReadonly: false,
                }
            )
        );

        registerTrees();
        registerCommands();

        // Set up docker context status bar items
        registerDockerContextStatusBarEvent(ctx);

        registerDebugProvider(ctx);
        registerTaskProviders(ctx);

        activateDockerfileLanguageClient(ctx);
        activateComposeLanguageClient(ctx);

        registerFileListeners();
        registerRuntimeTelemetryHandler(ctx);
    });

    // Migrate settings
    // Don't wait
    void migrateDockerToContainersSettingsIfNeeded(ctx);

    // Call command to activate container runtime provider extensions
    // Don't wait
    void vscode.commands.executeCommand('vscode-containers.activateContainerRuntimeProviders');

    // Call command to activate registry provider extensions
    // Don't wait
    void vscode.commands.executeCommand('vscode-containers.activateRegistryProviders');

    return new DockerExtensionApi(ctx);
}

export async function deactivateInternal(ctx: vscode.ExtensionContext): Promise<void> {
    await callWithTelemetryAndErrorHandling('vscode-containers.deactivate', async (activateContext: IActionContext) => {
        activateContext.telemetry.properties.isActivationEvent = 'true';

        await Promise.all([
            dockerfileLanguageClient.stop(),
            composeLanguageClient.stop(),
        ]);
    });
}

function registerEnvironmentVariableContributions(): void {
    // Set environment variable contributions initially
    setEnvironmentVariableContributions();

    // Register an event to watch for changes to config, reconfigure if needed
    registerEvent('vscode-containers.environment.changed', vscode.workspace.onDidChangeConfiguration, (actionContext: IActionContext, e: vscode.ConfigurationChangeEvent) => {
        actionContext.telemetry.suppressAll = true;
        actionContext.errorHandling.suppressDisplay = true;

        if (e.affectsConfiguration(`${configPrefix}.environment`)) {
            logDockerEnvironment(ext.outputChannel);
            setEnvironmentVariableContributions();
        }
    });
}

function setEnvironmentVariableContributions(): void {
    const settingValue: NodeJS.ProcessEnv = vscode.workspace.getConfiguration(configPrefix).get<NodeJS.ProcessEnv>('environment', {});

    ext.context.environmentVariableCollection.clear();
    ext.context.environmentVariableCollection.persistent = true;

    for (const key of Object.keys(settingValue)) {
        ext.context.environmentVariableCollection.replace(key, settingValue[key]);
    }
}

function registerDockerClients(): void {
    // Create the clients
    const dockerClient = new AutoConfigurableDockerClient();
    const podmanClient = new AutoConfigurablePodmanClient();
    const composeClient = new AutoConfigurableDockerComposeClient();

    // Register the clients
    ext.context.subscriptions.push(
        ext.runtimeManager.registerRuntimeClient(dockerClient),
        ext.runtimeManager.registerRuntimeClient(podmanClient),
        ext.orchestratorManager.registerRuntimeClient(composeClient)
    );

    // Register an event to watch for changes to config, reconfigure if needed
    registerEvent('vscode-containers.command.changed', vscode.workspace.onDidChangeConfiguration, (actionContext: IActionContext, e: vscode.ConfigurationChangeEvent) => {
        actionContext.telemetry.suppressAll = true;
        actionContext.errorHandling.suppressDisplay = true;

        if (e.affectsConfiguration(`${configPrefix}.containerCommand`)) {
            dockerClient.reconfigure();
            podmanClient.reconfigure();
        }

        if (e.affectsConfiguration(`${configPrefix}.composeCommand`)) {
            composeClient.reconfigure();
        }
    });
}

//#region Language services

/* eslint-disable @typescript-eslint/no-namespace */
namespace Configuration {
    export function computeConfiguration(params: ConfigurationParams): vscode.WorkspaceConfiguration[] {
        const result: vscode.WorkspaceConfiguration[] = [];
        for (const item of params.items) {
            let config: vscode.WorkspaceConfiguration;

            if (item.scopeUri) {
                config = vscode.workspace.getConfiguration(
                    item.section,
                    dockerfileLanguageClient.protocol2CodeConverter.asUri(item.scopeUri)
                );
            } else {
                config = vscode.workspace.getConfiguration(item.section);
            }
            result.push(config);
        }
        return result;
    }

    export function initialize(ctx: vscode.ExtensionContext): void {
        ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration(
            async (e: vscode.ConfigurationChangeEvent) => {
                // notify the language server that settings have change
                void dockerfileLanguageClient.sendNotification(DidChangeConfigurationNotification.type, {
                    settings: null
                });
            }
        ));
    }
}
/* eslint-enable @typescript-eslint/no-namespace */

function activateDockerfileLanguageClient(ctx: vscode.ExtensionContext): void {
    // Don't wait
    void callWithTelemetryAndErrorHandling('vscode-containers.languageclient.activate', async (context: IActionContext) => {
        context.telemetry.properties.isActivationEvent = 'true';
        const serverModule = ctx.asAbsolutePath(
            path.join(
                "dist",
                "dockerfile-language-server-nodejs",
                "lib",
                "server.js"
            )
        );

        const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

        const serverOptions: ServerOptions = {
            run: {
                module: serverModule,
                transport: TransportKind.ipc,
                args: ["--node-ipc"]
            },
            debug: {
                module: serverModule,
                transport: TransportKind.ipc,
                options: debugOptions
            }
        };

        const middleware: Middleware = {
            workspace: {
                configuration: Configuration.computeConfiguration
            }
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: DOCUMENT_SELECTOR,
            synchronize: {
                fileEvents: vscode.workspace.createFileSystemWatcher("**/.clientrc")
            },
            middleware: middleware
        };

        dockerfileLanguageClient = new LanguageClient(
            "dockerfile-langserver",
            "Dockerfile Language Server",
            serverOptions,
            clientOptions
        );
        dockerfileLanguageClient.registerProposedFeatures();

        ctx.subscriptions.push(dockerfileLanguageClient);
        await dockerfileLanguageClient.start();
        Configuration.initialize(ctx);
    });
}

function activateComposeLanguageClient(ctx: vscode.ExtensionContext): void {
    // Don't wait
    void callWithTelemetryAndErrorHandling('vscode-containers.composelanguageclient.activate', async (context: IActionContext) => {
        context.telemetry.properties.isActivationEvent = 'true';

        const config = vscode.workspace.getConfiguration(configPrefix);
        if (!config.get('enableComposeLanguageService', true)) {
            throw new UserCancelledError('languageServiceDisabled');
        }

        const serverModule = ctx.asAbsolutePath(
            path.join(
                "dist",
                "compose-language-service",
                "lib",
                "server.js"
            )
        );

        const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

        const serverOptions: ServerOptions = {
            run: {
                module: serverModule,
                transport: TransportKind.ipc,
                args: ["--node-ipc"]
            },
            debug: {
                module: serverModule,
                transport: TransportKind.ipc,
                options: debugOptions
            }
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [{ language: 'dockercompose' }]
        };

        composeLanguageClient = new LanguageClient(
            "compose-language-service",
            "Compose Language Server",
            serverOptions,
            clientOptions
        );
        composeLanguageClient.registerProposedFeatures();
        composeLanguageClient.registerFeature(new DocumentSettingsClientFeature(composeLanguageClient));
        composeLanguageClient.registerFeature(new AlternateYamlLanguageServiceClientFeature());

        registerEvent('compose-langserver-event', composeLanguageClient.onTelemetry, (context: IActionContext, evtArgs: TelemetryEvent) => {
            context.telemetry.properties.langServerEventName = evtArgs.eventName;
            context.telemetry.suppressAll = evtArgs.suppressAll;
            context.telemetry.suppressIfSuccessful = evtArgs.suppressIfSuccessful;

            Object.assign(context.telemetry.measurements, evtArgs.measurements);
            Object.assign(context.telemetry.properties, evtArgs.properties);
        });

        ctx.subscriptions.push(composeLanguageClient);
        await composeLanguageClient.start();
    });
}

//#endregion Language services
