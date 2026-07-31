/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerClient, DockerComposeClient, IContainerOrchestratorClient, IContainersClient, NerdctlClient, NerdctlComposeClient, PodmanClient, PodmanComposeClient, WslcClient } from '@microsoft/vscode-container-client';
import { isWindows } from '../utils/osUtils';

/**
 * A client class that can be instantiated with no arguments and exposes its well-known id as a
 * static. Registrations hold the class itself rather than an instance so that consumers which only
 * need the id or the class name (e.g. telemetry) don't have to construct a client.
 */
type ClientConstructor<TClient> = (new () => TClient) & { readonly ClientId: string };

export interface OfficialRuntimeRegistration {
    readonly containerClient: ClientConstructor<IContainersClient>;

    /**
     * The orchestrator (compose) client paired with this runtime, if it has one. Runtimes without a
     * compose counterpart (wslc) leave the orchestrator setting untouched when selected.
     */
    readonly orchestratorClient?: ClientConstructor<IContainerOrchestratorClient>;

    /**
     * Whether this runtime can be used on the current machine. Runtimes without this predicate are
     * supported everywhere.
     */
    readonly isSupported?: () => boolean;
}

/**
 * The single source of truth for the container runtimes this extension ships support for. Adding a
 * runtime here registers its clients, adds it to the runtime picker, and names it in telemetry.
 *
 * The corresponding `containers.containerClient` / `containers.orchestratorClient` enums in
 * package.json must be updated by hand, since those are static configuration contributions.
 */
export const officialRuntimeRegistrations: readonly OfficialRuntimeRegistration[] = [
    { containerClient: DockerClient, orchestratorClient: DockerComposeClient },
    { containerClient: PodmanClient, orchestratorClient: PodmanComposeClient },
    { containerClient: NerdctlClient, orchestratorClient: NerdctlComposeClient },
    // The WSL Container CLI is Windows-only and has no compose counterpart.
    { containerClient: WslcClient, isSupported: isWindows },
];

/**
 * The registrations usable on the current machine.
 */
export function getSupportedRuntimeRegistrations(): OfficialRuntimeRegistration[] {
    return officialRuntimeRegistrations.filter((registration) => !registration.isSupported || registration.isSupported());
}

/**
 * Resolve a configured client id to a stable name for telemetry.
 *
 * All registrations are considered, not just the ones supported on this machine, so that a setting
 * synced from another OS is still reported accurately rather than as 'unknown'.
 *
 * @param clientId The configured client id; empty/undefined means the user hasn't chosen one
 * @param getClient Picks the container or orchestrator half of a registration
 * @returns The client class name, or 'default'/'unknown'
 */
function getClientTelemetryName(clientId: string | undefined, getClient: (registration: OfficialRuntimeRegistration) => ClientConstructor<unknown> | undefined): string {
    if (!clientId) {
        return 'default';
    }

    for (const registration of officialRuntimeRegistrations) {
        const client = getClient(registration);
        if (client?.ClientId === clientId) {
            return client.name;
        }
    }

    return 'unknown';
}

export function getContainerClientTelemetryName(clientId: string | undefined): string {
    return getClientTelemetryName(clientId, (registration) => registration.containerClient);
}

export function getOrchestratorClientTelemetryName(clientId: string | undefined): string {
    return getClientTelemetryName(clientId, (registration) => registration.orchestratorClient);
}
