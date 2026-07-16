/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    CommandLineArgs,
    composeArgs,
    withArg,
    withFlagArg,
    withNamedArg,
    withVerbatimArg
} from '@microsoft/vscode-processutils';
import { DownCommandOptions, IContainerOrchestratorClient, UpCommandOptions } from '../../contracts/ContainerOrchestratorClient';
import { DockerComposeClientBase, withCommonOrchestratorArgs, withComposeArg } from '../DockerComposeClientBase/DockerComposeClientBase';

export class NerdctlComposeClient extends DockerComposeClientBase implements IContainerOrchestratorClient {
    /**
     * The ID of the Nerdctl Compose client
     */
    public static ClientId = 'com.microsoft.visualstudio.orchestrators.nerdctlcompose';

    /**
     * Constructs a new {@link NerdctlComposeClient}
     * @param commandName (Optional, default `nerdctl`) The command that will be run
     * as the base command. If quoting is necessary, it is the responsibility of the
     * caller to add.
     * @param displayName (Optional, default 'Nerdctl Compose') The human-friendly display
     * name of the client
     * @param description (Optional, with default) The human-friendly description of
     * the client
     */
    public constructor(
        commandName: string = 'nerdctl',
        displayName: string = 'Nerdctl Compose',
        description: string = 'Runs orchestrator commands using the Nerdctl Compose CLI'
    ) {
        super(
            NerdctlComposeClient.ClientId,
            commandName,
            displayName,
            description
        );

        // Nerdctl always uses the V2 compose syntax (nerdctl compose <command>)
        this.composeV2 = true;
    }

    /**
     * Override to exclude unsupported flags by nerdctl compose up:
     * - --timeout: not supported
     * - --no-start: not supported
     * - --wait: not supported
     * - --watch: not supported
     */
    protected override getUpCommandArgs(options: UpCommandOptions): CommandLineArgs {
        return composeArgs(
            withComposeArg(this.composeV2),
            withCommonOrchestratorArgs(options),
            withArg('up'),
            withFlagArg('--detach', options.detached),
            withFlagArg('--build', options.build),
            withNamedArg('--scale', Object.entries(options.scale ?? {}).map(([service, scale]) => `${service}=${scale}`)),
            withFlagArg('--force-recreate', options.recreate === 'force'),
            withFlagArg('--no-recreate', options.recreate === 'no'),
            // Note: --no-start, --wait, --watch, --timeout are NOT supported by nerdctl compose up
            withVerbatimArg(options.customOptions),
            withArg(...(options.services ?? [])),
        )();
    }

    /**
     * Override to exclude --timeout flag which is not supported by nerdctl compose down
     */
    protected override getDownCommandArgs(options: DownCommandOptions): CommandLineArgs {
        return composeArgs(
            withComposeArg(this.composeV2),
            withCommonOrchestratorArgs(options),
            withArg('down'),
            withNamedArg('--rmi', options.removeImages),
            withFlagArg('--volumes', options.removeVolumes),
            // Note: --timeout is NOT supported by nerdctl compose down (unlike Docker Compose)
            withVerbatimArg(options.customOptions),
            withArg(...(options.services ?? [])),
        )();
    }
}
