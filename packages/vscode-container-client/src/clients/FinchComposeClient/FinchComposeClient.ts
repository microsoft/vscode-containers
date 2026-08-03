/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IContainerOrchestratorClient } from '../../contracts/ContainerOrchestratorClient';
import { NerdctlComposeClient } from '../NerdctlComposeClient/NerdctlComposeClient';

/**
 * A client for the Finch CLI's compose support. `finch compose` is forwarded verbatim
 * to `nerdctl compose`, so the command lines are identical to
 * {@link NerdctlComposeClient}'s.
 */
export class FinchComposeClient extends NerdctlComposeClient implements IContainerOrchestratorClient {
    /**
     * The ID of the Finch Compose client
     */
    public static ClientId = 'com.microsoft.visualstudio.orchestrators.finchcompose';

    /**
     * Constructs a new {@link FinchComposeClient}
     */
    public constructor() {
        super(
            'finch',
            'Finch Compose',
            'Runs orchestrator commands using the Finch Compose CLI',
            FinchComposeClient.ClientId
        );
    }
}
