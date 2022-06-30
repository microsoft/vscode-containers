/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CommandResponse } from '../../contracts/CommandRunner';
import {
    CommonOrchestratorCommandOptions,
    ConfigCommandOptions,
    ConfigItem,
    DownCommandOptions,
    IContainerOrchestratorClient,
    LogsCommandOptions,
    RestartCommandOptions,
    StartCommandOptions,
    StopCommandOptions,
    UpCommandOptions
} from '../../contracts/ContainerOrchestratorClient';
import {
    CommandLineArgs,
    CommandLineCurryFn,
    composeArgs,
    withArg,
    withFlagArg,
    withNamedArg
} from '../../utils/commandLineBuilder';

function withCommonOrchestratorArgs(options: CommonOrchestratorCommandOptions): CommandLineCurryFn {
    return composeArgs(
        withNamedArg('--file', options.files),
        withNamedArg('--env-file', options.environmentFile),
        withNamedArg('--project-name', options.projectName),
    );
}

export class DockerComposeClient implements IContainerOrchestratorClient {
    public readonly id: string = 'com.microsoft.visualstudio.orchestrators.dockercompose';
    public readonly displayName: string = 'Docker Compose';
    public readonly description: string = 'Runs orchestrator commands using the Docker Compose CLI';
    public readonly commandName: string = 'docker compose';

    //#region Up command

    protected getUpCommandArgs(options: UpCommandOptions): CommandLineArgs {
        return composeArgs(
            withCommonOrchestratorArgs(options),
            withNamedArg('--profile', options.profiles),
            withArg('up'),
            withFlagArg('--detach', options.detached),
            withFlagArg('--build', options.build),
            withNamedArg('--scale', Object.entries(options.scale || {}).map(([service, scale]) => `${service}=${scale}`)),
            withNamedArg('--timeout', options.timeoutSeconds?.toString(10)),
            withFlagArg('--wait', options.wait),
            withArg(options.customOptions),
            withArg(options.services?.join(' ')),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator up command for Docker Compose
     * @param options Standard orchestrator up command options
     * @returns A CommandResponse indicating how to run an orchestrator up command for Docker Compose
     */
    public async up(options: UpCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: this.commandName,
            args: this.getUpCommandArgs(options),
        };
    }

    //#endregion Up command

    //#region Down command

    protected getDownCommandArgs(options: DownCommandOptions): CommandLineArgs {
        return composeArgs(
            withCommonOrchestratorArgs(options),
            withArg('down'),
            withNamedArg('--images', options.removeImages),
            withFlagArg('--volumes', options.removeVolumes),
            withNamedArg('--timeout', options.timeoutSeconds?.toString(10)),
            withArg(options.customOptions),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator down command for Docker Compose
     * @param options Standard orchestrator down command options
     * @returns A CommandResponse indicating how to run an orchestrator down command for Docker Compose
     */
    public async down(options: DownCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: this.commandName,
            args: this.getDownCommandArgs(options),
        };
    }

    //#endregion Down command

    //#region Start command

    protected getStartCommandArgs(options: StartCommandOptions): CommandLineArgs {
        return composeArgs(
            withCommonOrchestratorArgs(options),
            withArg('start'),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator start command for Docker Compose
     * @param options Standard orchestrator start command options
     * @returns A CommandResponse indicating how to run an orchestrator start command for Docker Compose
     */
    public async start(options: StartCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: this.commandName,
            args: this.getStartCommandArgs(options),
        };
    }

    //#endregion Start command

    //#region Stop command

    protected getStopCommandArgs(options: StopCommandOptions): CommandLineArgs {
        return composeArgs(
            withCommonOrchestratorArgs(options),
            withArg('stop'),
            withNamedArg('--timeout', options.timeoutSeconds?.toString(10)),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator stop command for Docker Compose
     * @param options Standard orchestrator stop command options
     * @returns A CommandResponse indicating how to run an orchestrator stop command for Docker Compose
     */
    public async stop(options: StopCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: this.commandName,
            args: this.getStopCommandArgs(options),
        };
    }

    //#endregion Stop command

    //#region Restart command

    protected getRestartCommandArgs(options: RestartCommandOptions): CommandLineArgs {
        return composeArgs(
            withCommonOrchestratorArgs(options),
            withArg('restart'),
            withNamedArg('--timeout', options.timeoutSeconds?.toString(10)),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator restart command for Docker Compose
     * @param options Standard orchestrator restart command options
     * @returns A CommandResponse indicating how to run an orchestrator restart command for Docker Compose
     */
    public async restart(options: RestartCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: this.commandName,
            args: this.getRestartCommandArgs(options),
        };
    }

    //#endregion Restart command

    //#region Logs command

    protected getLogsCommandArgs(options: LogsCommandOptions): CommandLineArgs {
        return composeArgs(
            withCommonOrchestratorArgs(options),
            withArg('logs'),
            withFlagArg('--follow', options.follow),
            withNamedArg('--tail', options.tail?.toString(10)),
        )();
    }

    /**
     * Generates the necessary information for running of an orchestrator logs command for Docker Compose
     * @param options Standard orchestrator logs command options
     * @returns A CommandResponse indicating how to run an orchestrator logs command for Docker Compose
     */
    public async logs(options: LogsCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: this.commandName,
            args: this.getLogsCommandArgs(options),
        };
    }

    //#endregion Logs command

    //#region Config command

    protected getConfigCommandArgs(options: ConfigCommandOptions): CommandLineArgs {
        return composeArgs(
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
    public async config(options: ConfigCommandOptions): Promise<CommandResponse<Array<ConfigItem>>> {
        return {
            command: this.commandName,
            args: this.getConfigCommandArgs(options),
            parse: this.parseConfigCommandOutput,
        };
    }

    //#endregion Config command
}
