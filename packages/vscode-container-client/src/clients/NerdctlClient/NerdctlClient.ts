/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    CancellationError,
    CancellationTokenLike,
    type CommandLineArgs,
    composeArgs,
    toArray,
    withArg,
    withFlagArg,
    withNamedArg,
    withVerbatimArg
} from '@microsoft/vscode-processutils';
import * as readline from 'readline';
import type {
    EventItem,
    EventStreamCommandOptions,
    IContainersClient,
    InfoItem,
    InspectContainersCommandOptions,
    InspectContainersItem,
    InspectImagesCommandOptions,
    InspectImagesItem,
    InspectNetworksCommandOptions,
    InspectNetworksItem,
    InspectVolumesCommandOptions,
    InspectVolumesItem,
    ListContainersCommandOptions,
    ListContainersItem,
    ListImagesCommandOptions,
    ListImagesItem,
    ListNetworkItem,
    ListNetworksCommandOptions,
    ListVolumeItem,
    ListVolumesCommandOptions,
    RunContainerCommandOptions,
    VersionItem
} from '../../contracts/ContainerClient';
import { CommandNotSupportedError } from '../../utils/CommandNotSupportedError';
import { DockerClientBase } from '../DockerClientBase/DockerClientBase';
import { withDockerAddHostArg } from '../DockerClientBase/withDockerAddHostArg';
import { withDockerEnvArg } from '../DockerClientBase/withDockerEnvArg';
import { withDockerJsonFormatArg } from '../DockerClientBase/withDockerJsonFormatArg';
import { withDockerLabelFilterArgs } from '../DockerClientBase/withDockerLabelFilterArgs';
import { withDockerLabelsArg } from '../DockerClientBase/withDockerLabelsArg';
import { withDockerMountsArg } from '../DockerClientBase/withDockerMountsArg';
import { withDockerPlatformArg } from '../DockerClientBase/withDockerPlatformArg';
import { withDockerPortsArg } from '../DockerClientBase/withDockerPortsArg';
import { NerdctlEventRecordSchema, getActorFromEventPayload, parseContainerdTopic } from './NerdctlEventRecord';
import { withNerdctlExposedPortsArg } from './withNerdctlExposedPortsArg';
import { NerdctlInspectContainerRecordSchema, normalizeNerdctlInspectContainerRecord } from './NerdctlInspectContainerRecord';
import { NerdctlInspectImageRecordSchema, normalizeNerdctlInspectImageRecord } from './NerdctlInspectImageRecord';
import { NerdctlInspectNetworkRecordSchema, normalizeNerdctlInspectNetworkRecord } from './NerdctlInspectNetworkRecord';
import { NerdctlInspectVolumeRecordSchema, normalizeNerdctlInspectVolumeRecord } from './NerdctlInspectVolumeRecord';
import { NerdctlListContainerRecordSchema, normalizeNerdctlListContainerRecord } from './NerdctlListContainerRecord';
import { NerdctlListImageRecordSchema, normalizeNerdctlListImageRecord } from './NerdctlListImageRecord';
import { NerdctlListNetworkRecordSchema, normalizeNerdctlListNetworkRecord } from './NerdctlListNetworkRecord';
import { NerdctlVersionRecordSchema } from './NerdctlVersionRecord';

export class NerdctlClient extends DockerClientBase implements IContainersClient {
    /**
     * The ID of the Nerdctl client
     */
    public static ClientId = 'com.microsoft.visualstudio.containers.nerdctl';

    /**
     * The default argument given to `--format`
     * Nerdctl uses the same format as Docker
     */
    protected readonly defaultFormatForJson: string = "{{json .}}";

    /**
     * Constructs a new {@link NerdctlClient}
     * @param commandName (Optional, default `nerdctl`) The command that will be run
     * as the base command. If quoting is necessary, it is the responsibility of the
     * caller to add. Use `finch` for AWS Nerdctl.
     * @param displayName (Optional, default 'Nerdctl') The human-friendly display
     * name of the client
     * @param description (Optional, with default) The human-friendly description of
     * the client
     */
    public constructor(
        commandName: string = 'nerdctl',
        displayName: string = 'Nerdctl',
        description: string = 'Runs container commands using the nerdctl CLI'
    ) {
        super(
            NerdctlClient.ClientId,
            commandName,
            displayName,
            description
        );
    }

    //#region RunContainer Command

    /**
     * Generates run container command args with nerdctl-specific handling for exposed ports.
     *
     * nerdctl doesn't support `--expose` and `--publish-all` flags.
     * Instead, when both `publishAllPorts` and `exposePorts` are specified, we convert
     * exposed ports to explicit `-p <containerPort>` arguments which bind them to
     * random host ports (equivalent to Docker's --expose + --publish-all behavior).
     */
    protected override getRunContainerCommandArgs(options: RunContainerCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'run'),
            withFlagArg('--detach', options.detached),
            withFlagArg('--interactive', options.interactive),
            withFlagArg('--tty', options.interactive), // TTY only for interactive mode, not detached
            withFlagArg('--rm', options.removeOnExit),
            withNamedArg('--name', options.name),
            withDockerPortsArg(options.ports),
            // nerdctl alternative: Convert exposePorts + publishAllPorts to -p <port> args
            withNerdctlExposedPortsArg(options.exposePorts, options.publishAllPorts),
            withNamedArg('--network', options.network),
            withNamedArg('--network-alias', options.networkAlias),
            withDockerAddHostArg(options.addHost),
            withDockerMountsArg(options.mounts),
            withDockerLabelsArg(options.labels),
            withDockerEnvArg(options.environmentVariables),
            withNamedArg('--env-file', options.environmentFiles),
            withNamedArg('--entrypoint', options.entrypoint),
            withDockerPlatformArg(options.platform),
            withVerbatimArg(options.customOptions),
            withArg(options.imageRef),
            typeof options.command === 'string' ? withVerbatimArg(options.command) : withArg(...(toArray(options.command ?? []))),
        )();
    }

    //#endregion

    //#region Version Command

    protected override parseVersionCommandOutput(output: string, strict: boolean): Promise<VersionItem> {
        try {
            const version = NerdctlVersionRecordSchema.parse(JSON.parse(output));

            // nerdctl may not have a traditional ApiVersion
            // Extract version info from the Client object
            const clientVersion = version.Client.Version;

            // For server components, try to find containerd version
            const serverComponent = version.Server?.Components?.find(c =>
                c.Name.toLowerCase() === 'containerd' || c.Name.toLowerCase() === 'server'
            );

            return Promise.resolve({
                client: clientVersion || 'unknown',
                server: serverComponent?.Version,
            });
        } catch {
            // If parsing fails with the new schema, try to extract version from output
            // as nerdctl might output version info differently
            if (strict) {
                throw new Error('Failed to parse nerdctl version output');
            }

            return Promise.resolve({
                client: 'unknown',
                server: undefined,
            });
        }
    }

    //#endregion

    //#region Info Command

    protected override parseInfoCommandOutput(output: string, strict: boolean): Promise<InfoItem> {
        // nerdctl info output is similar to Docker but may have different fields
        try {
            const info = JSON.parse(output) as { OperatingSystem?: string; OSType?: string };
            // Normalize osType to valid enum values
            const osType = info.OSType?.toLowerCase();
            const normalizedOsType: 'linux' | 'windows' | undefined =
                osType === 'linux' ? 'linux' : osType === 'windows' ? 'windows' : undefined;

            return Promise.resolve({
                operatingSystem: info.OperatingSystem ?? info.OSType,
                osType: normalizedOsType ?? 'linux',
                raw: output,
            });
        } catch (err) {
            // In strict mode, propagate the error instead of returning fallback
            if (strict) {
                return Promise.reject(err instanceof Error ? err : new Error(String(err)));
            }
            return Promise.resolve({
                operatingSystem: undefined,
                osType: 'linux',
                raw: output,
            });
        }
    }

    //#endregion

    //#region GetEventStream Command

    /**
     * nerdctl event stream limitations:
     * - Does NOT support --since and --until flags (no historical replay)
     * - Does NOT support Docker-style filters (type=, event=)
     * - Does NOT support label filtering (containerd events don't include label data)
     * - Outputs containerd native events, NOT Docker-compatible format
     *
     * Client-side filtering is implemented in parseEventStreamCommandOutput to:
     * - Filter by event types (container, image, etc.)
     * - Filter by event actions (create, delete, start, stop, etc.)
     * - Filter by since/until timestamps (when provided)
     *
     * @throws {CommandNotSupportedError} if labels filter is provided (not supported by nerdctl)
     */
    protected override getEventStreamCommandArgs(options: EventStreamCommandOptions): CommandLineArgs {
        // Label filtering is not supported by nerdctl - containerd events don't include label data
        // Throw a clear error rather than silently ignoring the filter
        if (options.labels && Object.keys(options.labels).length > 0) {
            throw new CommandNotSupportedError('Label filtering for events is not supported by nerdctl');
        }

        // nerdctl events command doesn't support Docker-style filters
        // All filtering is done client-side in parseEventStreamCommandOutput
        return composeArgs(
            withArg('events'),
            withDockerJsonFormatArg(this.defaultFormatForJson),
        )();
    }

    protected override async *parseEventStreamCommandOutput(
        options: EventStreamCommandOptions,
        output: NodeJS.ReadableStream,
        strict: boolean,
        cancellationToken?: CancellationTokenLike
    ): AsyncGenerator<EventItem> {
        cancellationToken ??= CancellationTokenLike.None;

        const lineReader = readline.createInterface({
            input: output,
            crlfDelay: Infinity,
        });

        // Parse since/until timestamps for client-side filtering
        const sinceTimestamp = options.since ? this.parseEventTimestamp(options.since) : undefined;
        const untilTimestamp = options.until ? this.parseEventTimestamp(options.until) : undefined;

        // `nerdctl events` has no `--until`, so we emulate it client-side. In
        // addition to breaking when an event newer than `until` arrives (below),
        // arm a wall-clock timer so the stream still terminates if it goes quiet
        // before `until` elapses, matching Docker's `events --until` behavior.
        let untilTimer: NodeJS.Timeout | undefined;
        if (untilTimestamp) {
            const msUntilElapsed = Math.max(0, untilTimestamp.getTime() - Date.now());
            untilTimer = setTimeout(() => lineReader.close(), msUntilElapsed);
            untilTimer.unref?.();
        }

        try {
            for await (const line of lineReader) {
                if (cancellationToken.isCancellationRequested) {
                    throw new CancellationError('Event stream cancelled', cancellationToken);
                }

                // Skip empty lines (nerdctl outputs newlines between events)
                const trimmedLine = line.trim();
                if (!trimmedLine) {
                    continue;
                }

                try {
                    const item = NerdctlEventRecordSchema.parse(JSON.parse(trimmedLine));

                    // Parse the containerd topic to get type and action
                    const typeAction = parseContainerdTopic(item.Topic);
                    if (!typeAction) {
                        // Skip events we can't map (e.g., internal snapshot events)
                        continue;
                    }

                    const { type, action } = typeAction;

                    // Client-side type filtering
                    if (options.types && options.types.length > 0 && !options.types.includes(type)) {
                        continue;
                    }

                    // Client-side action filtering
                    if (options.events && options.events.length > 0 && !options.events.includes(action)) {
                        continue;
                    }

                    // Parse the event timestamp
                    const timestamp = new Date(item.Timestamp);

                    // Client-side since filtering
                    if (sinceTimestamp && timestamp < sinceTimestamp) {
                        continue;
                    }

                    // Client-side until filtering - stop streaming if we've passed the until time
                    if (untilTimestamp && timestamp > untilTimestamp) {
                        break;
                    }

                    // Extract the actor from the already-parsed Event payload
                    const actor = getActorFromEventPayload(item.Event);

                    yield {
                        type,
                        action,
                        actor,
                        timestamp,
                        raw: line,
                    };
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }
            }
        } finally {
            if (untilTimer) {
                clearTimeout(untilTimer);
            }
            lineReader.close();
        }
    }

    /**
     * Parse event timestamp from various formats:
     * - Unix timestamp (number or string number)
     * - Relative time like "1m", "5s" (positive means in the past, e.g., "1m" = 1 minute ago)
     * - Negative relative time like "-1s" (means in the future, e.g., "-1s" = 1 second from now)
     * - ISO date string
     */
    private parseEventTimestamp(value: string | number): Date {
        if (typeof value === 'number') {
            return new Date(value * 1000);
        }

        // Try as Unix timestamp
        const asNumber = parseInt(value, 10);
        if (!Number.isNaN(asNumber) && String(asNumber) === value) {
            return new Date(asNumber * 1000);
        }

        // Try as relative time (e.g., "1m", "5s", "-30s")
        // Positive values mean "ago" (in the past), negative values mean "from now" (in the future)
        const relativeMatch = /^(-?\d+)(s|m|h|d)$/.exec(value);
        if (relativeMatch) {
            const amount = parseInt(relativeMatch[1], 10);
            const unit = relativeMatch[2];
            const now = Date.now();
            const multipliers: Record<string, number> = {
                's': 1000,
                'm': 60 * 1000,
                'h': 60 * 60 * 1000,
                'd': 24 * 60 * 60 * 1000,
            };
            // Subtract: "1m" -> 1 minute ago, "-1s" -> 1 second from now
            return new Date(now - amount * (multipliers[unit] ?? 1000));
        }

        // Try as ISO date string
        return new Date(value);
    }

    //#endregion

    //#region ListImages Command

    protected override parseListImagesCommandOutput(_options: ListImagesCommandOptions, output: string, strict: boolean): Promise<ListImagesItem[]> {
        return this.parsePerLineJson(output, strict, (imageJson) =>
            normalizeNerdctlListImageRecord(NerdctlListImageRecordSchema.parse(JSON.parse(imageJson))));
    }

    //#endregion

    //#region InspectImages Command

    protected override parseInspectImagesCommandOutput(
        _options: InspectImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectImagesItem>> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeNerdctlInspectImageRecord(NerdctlInspectImageRecordSchema.parse(item), JSON.stringify(item)));
    }

    //#endregion

    //#region ListContainers Command

    protected override parseListContainersCommandOutput(_options: ListContainersCommandOptions, output: string, strict: boolean): Promise<ListContainersItem[]> {
        return this.parsePerLineJson(output, strict, (containerJson) =>
            normalizeNerdctlListContainerRecord(NerdctlListContainerRecordSchema.parse(JSON.parse(containerJson)), strict));
    }

    //#endregion

    //#region InspectContainers Command

    protected override parseInspectContainersCommandOutput(_options: InspectContainersCommandOptions, output: string, strict: boolean): Promise<InspectContainersItem[]> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeNerdctlInspectContainerRecord(NerdctlInspectContainerRecordSchema.parse(item), JSON.stringify(item)));
    }

    //#endregion

    //#region ListNetworks Command

    // nerdctl doesn't support --no-trunc for network ls
    protected override getListNetworksCommandArgs(options: ListNetworksCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('network', 'ls'),
            withDockerLabelFilterArgs(options.labels),
            // Note: nerdctl doesn't support --no-trunc for network ls
            withDockerJsonFormatArg(this.defaultFormatForJson),
        )();
    }

    protected override parseListNetworksCommandOutput(_options: ListNetworksCommandOptions, output: string, strict: boolean): Promise<ListNetworkItem[]> {
        return this.parsePerLineJson(output, strict, (networkJson) =>
            normalizeNerdctlListNetworkRecord(NerdctlListNetworkRecordSchema.parse(JSON.parse(networkJson))));
    }

    //#endregion

    //#region InspectNetworks Command

    protected override parseInspectNetworksCommandOutput(_options: InspectNetworksCommandOptions, output: string, strict: boolean): Promise<InspectNetworksItem[]> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeNerdctlInspectNetworkRecord(NerdctlInspectNetworkRecordSchema.parse(item), JSON.stringify(item)));
    }

    //#endregion

    //#region ListVolumes Command

    protected override parseListVolumesCommandOutput(_options: ListVolumesCommandOptions, output: string, strict: boolean): Promise<ListVolumeItem[]> {
        return this.parsePerLineJson(output, strict, (volumeJson) => {
            // The schema already normalizes Labels (string/record -> record) and
            // CreatedAt (string -> Date), so no further parsing is needed here.
            const rawVolume = NerdctlInspectVolumeRecordSchema.parse(JSON.parse(volumeJson));

            return {
                name: rawVolume.Name,
                driver: rawVolume.Driver || 'local',
                labels: rawVolume.Labels ?? {},
                mountpoint: rawVolume.Mountpoint || '',
                scope: rawVolume.Scope || 'local',
                createdAt: rawVolume.CreatedAt,
                size: undefined, // nerdctl doesn't always provide size in list
            };
        });
    }

    //#endregion

    //#region InspectVolumes Command

    protected override parseInspectVolumesCommandOutput(_options: InspectVolumesCommandOptions, output: string, strict: boolean): Promise<InspectVolumesItem[]> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeNerdctlInspectVolumeRecord(NerdctlInspectVolumeRecordSchema.parse(item), JSON.stringify(item)));
    }

    //#endregion

    // ReadFile and WriteFile use the DockerClientBase implementations, which
    // stream a tar archive via `<command> cp <container>:<path> -` and
    // `<command> cp - <container>:<path>`. This requires nerdctl >= 2.3.0, which
    // added stdin/stdout streaming support for `cp` (containerd/nerdctl#4704).
}
