/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IContainerOrchestratorClient } from '../../contracts/ContainerOrchestratorClient';
import { DockerComposeClientBase } from '../DockerComposeClientBase/DockerComposeClientBase';

export class DockerComposeClient extends DockerComposeClientBase implements IContainerOrchestratorClient {
    /**
     * The ID of the Docker Compose client
     */
    public static ClientId = 'com.microsoft.visualstudio.orchestrators.dockercompose';

    /**
     * Constructs a new {@link DockerComposeClient}
     * @param commandName (Optional, default `docker`) The command that will be run
     * as the base command. If quoting is necessary, it is the responsibility of the
     * caller to add.
     * @param displayName (Optional, default 'Docker Compose') The human-friendly display
     * name of the client
     * @param description (Optional, with default) The human-friendly description of
     * the client
     * @param composeV2 (Optional, default `true`) If true, `compose` will be added as the
     * first argument to all commands. The base command should be `docker`.
     */
    public constructor(
        commandName?: string,
        displayName: string = 'Docker Compose',
        description: string = 'Runs orchestrator commands using the Docker Compose CLI',
        composeV2: boolean = true
    ) {
        super(
            DockerComposeClient.ClientId,
            commandName || composeV2 ? 'docker' : 'docker-compose',
            displayName,
            description
        );

        this.composeV2 = composeV2;
    }
}
