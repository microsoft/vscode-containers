/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IContainersClient } from '../../contracts/ContainerClient';
import { NerdctlClient } from '../NerdctlClient/NerdctlClient';

/**
 * A client for the Finch CLI. Finch is a thin wrapper around nerdctl (running in a
 * Lima VM), forwarding almost every subcommand to nerdctl verbatim, so the command
 * lines are identical to {@link NerdctlClient}'s.
 */
export class FinchClient extends NerdctlClient implements IContainersClient {
    /**
     * The ID of the Finch client
     */
    public static ClientId = 'com.microsoft.visualstudio.containers.finch';

    /**
     * Constructs a new {@link FinchClient}
     */
    public constructor() {
        super(
            'finch',
            'Finch',
            'Runs container commands using the Finch CLI',
            FinchClient.ClientId
        );
    }

    //#region Version Command

    // `version` is one of the few commands Finch implements itself rather than
    // forwarding to nerdctl. Its output nests the nerdctl version under
    // `Client.NerdctlClient` and reports the Finch version as `Client.Version`:
    //
    //   { "Client": { "Version": "v1.17.2",                    // Finch
    //                 "NerdctlClient": { "Version": "v2.2.2" } // nerdctl
    //               },
    //     "Server": { "Components": [ { "Name": "containerd", ... } ] } }
    //
    // No override is needed. The inherited nerdctl parsing reads `Client.Version`,
    // which is the Finch version -- the version of the CLI actually being invoked,
    // matching both `finch -v` (used by `checkInstall`) and every other client, which
    // all report their own CLI version. `Server` is passed through from nerdctl
    // unmodified, so the containerd component lookup works as-is. The nerdctl version
    // is deliberately not surfaced; it is an implementation detail of the VM.

    //#endregion
}
