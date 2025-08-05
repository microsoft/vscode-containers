/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    CommandLineArgs,
    CommandLineCurryFn,
    composeArgs,
    stringStreamToGenerator,
    withArg,
    withFlagArg,
    withNamedArg,
    withVerbatimArg
} from '@microsoft/vscode-processutils';
import { GeneratorCommandResponse, PromiseCommandResponse, VoidCommandResponse } from '../../contracts/CommandRunner';
import {
    CheckOrchestratorInstallCommandOptions,
    CommonOrchestratorCommandOptions,
    ConfigCommandOptions,
    ConfigItem,
    DownCommandOptions,
    IContainerOrchestratorClient,
    LogsCommandOptions,
    RestartCommandOptions,
    StartCommandOptions,
    StopCommandOptions,
    UpCommandOptions,
} from '../../contracts/ContainerOrchestratorClient';
import { ConfigurableClient } from '../ConfigurableClient';

function withCommonOrchestratorArgs(options: CommonOrchestratorCommandOptions): CommandLineCurryFn {
    return composeArgs(
        withNamedArg('--file', options.files),
        withNamedArg('--env-file', options.environmentFile),
        withNamedArg('--project-name', options.projectName),
        withNamedArg('--profile', options.profiles),
    );
}

function withComposeArg(composeV2: boolean): CommandLineCurryFn {
    // If using Compose V2, then add the `compose` argument at the beginning
    // That way, the command is `docker compose` instead of `docker-compose`
    return withArg(composeV2 ? 'compose' : undefined);
}

export abstract class DockerComposeClientBase extends ConfigurableClient implements IContainerOrchestratorClient {

    /**
     * Whether to use Docker Compose V2 or not.
     * If true, the command will be like `docker compose` instead of `docker-compose`.
     */
    public composeV2: boolean = true;

    //#region Check orchestrator install command

    protected getCheckOrchestratorInstallCommandArgs(options: CheckOrchestratorInstallCommandOptions): CommandLineArgs {
        let checkComposeV2: boolean;
        switch (options.composeVersion) {
            case 'v1':
                checkComposeV2 = false;
                break;
            case 'v2':
                checkComposeV2 = true;
                break;
            default:
                checkComposeV2 = this.composeV2;
                break;
        }

        return composeArgs(
            withComposeArg(checkComposeV2),
            withArg('version'),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator install check command for Docker Compose
     * @param options Command options
     * @returns A CommandResponse indicating how to run an orchestrator install check command for Docker Compose
     */
    public async checkOrchestratorInstall(options: CheckOrchestratorInstallCommandOptions): Promise<PromiseCommandResponse<string>> {
        return {
            command: this.commandName,
            args: this.getCheckOrchestratorInstallCommandArgs(options),
            parse: (output) => Promise.resolve(output),
        };
    }

    //#endregion Check orchestrator install command

    //#region Up command

    protected getUpCommandArgs(options: UpCommandOptions): CommandLineArgs {
        return composeArgs(
            withComposeArg(this.composeV2),
            withCommonOrchestratorArgs(options),
            withArg('up'),
            withFlagArg('--detach', options.detached),
            withFlagArg('--build', options.build),
            withNamedArg('--scale', Object.entries(options.scale || {}).map(([service, scale]) => `${service}=${scale}`)),
            withNamedArg('--timeout', options.timeoutSeconds?.toString(10)),
            withFlagArg('--force-recreate', options.recreate === 'force'),
            withFlagArg('--no-recreate', options.recreate === 'no'),
            withFlagArg('--no-start', options.noStart),
            withFlagArg('--wait', options.wait),
            withFlagArg('--watch', options.watch),
            withVerbatimArg(options.customOptions),
            withArg(...(options.services || [])),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator up command for Docker Compose
     * @param options Standard orchestrator up command options
     * @returns A CommandResponse indicating how to run an orchestrator up command for Docker Compose
     */
    public async up(options: UpCommandOptions): Promise<VoidCommandResponse> {
        return {
            command: this.commandName,
            args: this.getUpCommandArgs(options),
        };
    }

    //#endregion Up command

    //#region Down command

    protected getDownCommandArgs(options: DownCommandOptions): CommandLineArgs {
        return composeArgs(
            withComposeArg(this.composeV2),
            withCommonOrchestratorArgs(options),
            withArg('down'),
            withNamedArg('--rmi', options.removeImages),
            withFlagArg('--volumes', options.removeVolumes),
            withNamedArg('--timeout', options.timeoutSeconds?.toString(10)),
            withVerbatimArg(options.customOptions),
            withArg(...(options.services || [])),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator down command for Docker Compose
     * @param options Standard orchestrator down command options
     * @returns A CommandResponse indicating how to run an orchestrator down command for Docker Compose
     */
    public async down(options: DownCommandOptions): Promise<VoidCommandResponse> {
        return {
            command: this.commandName,
            args: this.getDownCommandArgs(options),
        };
    }

    //#endregion Down command

    //#region Start command

    protected getStartCommandArgs(options: StartCommandOptions): CommandLineArgs {
        return composeArgs(
            withComposeArg(this.composeV2),
            withCommonOrchestratorArgs(options),
            withArg('start'),
            withArg(...(options.services || [])),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator start command for Docker Compose
     * @param options Standard orchestrator start command options
     * @returns A CommandResponse indicating how to run an orchestrator start command for Docker Compose
     */
    public async start(options: StartCommandOptions): Promise<VoidCommandResponse> {
        return {
            command: this.commandName,
            args: this.getStartCommandArgs(options),
        };
    }

    //#endregion Start command

    //#region Stop command

    protected getStopCommandArgs(options: StopCommandOptions): CommandLineArgs {
        return composeArgs(
            withComposeArg(this.composeV2),
            withCommonOrchestratorArgs(options),
            withArg('stop'),
            withNamedArg('--timeout', options.timeoutSeconds?.toString(10)),
            withArg(...(options.services || [])),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator stop command for Docker Compose
     * @param options Standard orchestrator stop command options
     * @returns A CommandResponse indicating how to run an orchestrator stop command for Docker Compose
     */
    public async stop(options: StopCommandOptions): Promise<VoidCommandResponse> {
        return {
            command: this.commandName,
            args: this.getStopCommandArgs(options),
        };
    }

    //#endregion Stop command

    //#region Restart command

    protected getRestartCommandArgs(options: RestartCommandOptions): CommandLineArgs {
        return composeArgs(
            withComposeArg(this.composeV2),
            withCommonOrchestratorArgs(options),
            withArg('restart'),
            withNamedArg('--timeout', options.timeoutSeconds?.toString(10)),
            withArg(...(options.services || [])),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator restart command for Docker Compose
     * @param options Standard orchestrator restart command options
     * @returns A CommandResponse indicating how to run an orchestrator restart command for Docker Compose
     */
    public async restart(options: RestartCommandOptions): Promise<VoidCommandResponse> {
        return {
            command: this.commandName,
            args: this.getRestartCommandArgs(options),
        };
    }

    //#endregion Restart command

    //#region Logs command

    protected getLogsCommandArgs(options: LogsCommandOptions): CommandLineArgs {
        return composeArgs(
            withComposeArg(this.composeV2),
            withCommonOrchestratorArgs(options),
            withArg('logs'),
            withFlagArg('--follow', options.follow),
            withNamedArg('--tail', options.tail?.toString(10)),
            withArg(...(options.services || [])),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator logs command for Docker Compose
     * @param options Standard orchestrator logs command options
     * @returns A CommandResponse indicating how to run an orchestrator logs command for Docker Compose
     */
    public async logs(options: LogsCommandOptions): Promise<GeneratorCommandResponse<string>> {
        return {
            command: this.commandName,
            args: this.getLogsCommandArgs(options),
            parseStream: (output, strict) => stringStreamToGenerator(output),
        };
    }

    //#endregion Logs command

    //#region Config command

    protected getConfigCommandArgs(options: ConfigCommandOptions): CommandLineArgs {
        return composeArgs(
            withComposeArg(this.composeV2),
            withCommonOrchestratorArgs(options),
            withArg('config'),
            withArg(`--${options.configType}`),
        )();
    }

    protected async parseConfigCommandOutput(
        output: string,
        strict: boolean,
    ): Promise<Array<ConfigItem>> {
        return output.split('\n').filter((config) => config);
    }

    /**
     * Generates the necessary information for running of an orchestrator config command for Docker Compose
     * @param options Standard orchestrator config command options
     * @returns A CommandResponse indicating how to run an orchestrator config command for Docker Compose
     */
    public async config(options: ConfigCommandOptions): Promise<PromiseCommandResponse<Array<ConfigItem>>> {
        return {
            command: this.commandName,
            args: this.getConfigCommandArgs(options),
            parse: this.parseConfigCommandOutput,
        };
    }

    //#endregion Config command
}
