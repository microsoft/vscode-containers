/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IContainersClient, VersionItem } from '../../contracts/ContainerClient';
import { NerdctlClient } from '../NerdctlClient/NerdctlClient';
import { FinchVersionRecordSchema } from './FinchVersionRecord';

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

    /**
     * `finch version` is one of the few commands Finch implements itself instead of
     * forwarding to nerdctl, and it nests the nerdctl version under
     * `Client.NerdctlClient` while reporting the Finch version as `Client.Version`.
     * The nerdctl version is reported as the client version, for consistency with what
     * the rest of the extension expects a container client version to mean.
     */
    protected override parseVersionCommandOutput(output: string, strict: boolean): Promise<VersionItem> {
        try {
            const version = FinchVersionRecordSchema.parse(JSON.parse(output));

            // Prefer the nerdctl version, but fall back to `Client.Version` (the Finch
            // version) in case `NerdctlClient` is absent, e.g. on older Finch releases
            const clientVersion = version.Client.NerdctlClient?.Version || version.Client.Version;

            // Finch passes `Server` through from nerdctl unmodified
            const serverComponent = version.Server?.Components?.find(c =>
                c.Name.toLowerCase() === 'containerd' || c.Name.toLowerCase() === 'server'
            );

            return Promise.resolve({
                client: clientVersion || 'unknown',
                server: serverComponent?.Version,
            });
        } catch {
            if (strict) {
                throw new Error('Failed to parse Finch version output');
            }

            return Promise.resolve({
                client: 'unknown',
                server: undefined,
            });
        }
    }

    //#endregion
}
