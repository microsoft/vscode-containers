/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContainerOrchestratorClient } from '../../contracts/ContainerOrchestratorClient';
import { DockerComposeClientBase } from '../DockerComposeClientBase/DockerComposeClientBase';

export class PodmanComposeClient extends DockerComposeClientBase implements IContainerOrchestratorClient {
    /**
     * The ID of the Podman Compose client
     */
    public static ClientId = 'com.microsoft.visualstudio.orchestrators.podmancompose';

    /**
     * Constructs a new {@link PodmanComposeClient}
     * @param commandName (Optional, default `podman`) The command that will be run
     * as the base command. If quoting is necessary, it is the responsibility of the
     * caller to add.
     * @param displayName (Optional, default 'Podman Compose') The human-friendly display
     * name of the client
     * @param description (Optional, with default) The human-friendly description of
     * the client
     * @param composeV2 (Optional, default `true`) If true, `compose` will be added as the
     * first argument to all commands. The base command should be `podman`.
     */
    public constructor(
        commandName?: string,
        displayName: string = 'Podman Compose',
        description: string = 'Runs orchestrator commands using the Podman Compose CLI',
        composeV2: boolean = true
    ) {
        super(
            PodmanComposeClient.ClientId,
            commandName || composeV2 ? 'podman' : 'podman-compose',
            displayName,
            description
        );

        this.composeV2 = composeV2;
    }
}
