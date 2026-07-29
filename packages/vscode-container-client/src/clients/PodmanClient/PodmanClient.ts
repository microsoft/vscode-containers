/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    CancellationError,
    CancellationTokenLike
} from '@microsoft/vscode-processutils';
import * as readline from 'readline';
import * as z from 'zod/mini';
import type {
    EventItem,
    EventStreamCommandOptions,
    IContainersClient,
    InfoItem,
    InspectNetworksItem,
    ListContainersCommandOptions,
    ListContainersItem,
    ListImagesCommandOptions,
    ListImagesItem,
    ListNetworkItem,
    ListNetworksCommandOptions,
    PortBinding,
    PruneContainersCommandOptions,
    PruneContainersItem,
    PruneImagesCommandOptions,
    PruneImagesItem,
    PruneNetworksCommandOptions,
    PruneNetworksItem,
    PruneVolumesCommandOptions,
    PruneVolumesItem,
    VersionItem
} from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { DockerClientBase } from '../DockerClientBase/DockerClientBase';
import { PodmanEventRecordSchema } from './PodmanEventRecord';
import { PodmanInspectNetworkRecordSchema, normalizePodmanInspectNetworkRecord } from './PodmanInspectNetworkRecord';
import { PodmanListContainerRecordSchema } from './PodmanListContainerRecord';
import { type PodmanListImageRecord, PodmanListImageRecordSchema } from './PodmanListImageRecord';
import { PodmanListNetworkRecordSchema } from './PodmanListNetworkRecord';
import { PodmanVersionRecordSchema } from './PodmanVersionRecord';

export class PodmanClient extends DockerClientBase implements IContainersClient {
    /**
     * The ID of the Podman client
     */
    public static ClientId = 'com.microsoft.visualstudio.containers.podman';

    /**
     * The default argument given to `--format`
     */
    protected readonly defaultFormatForJson: string = "json";

    /**
     * Constructs a new {@link PodmanClient}
     * @param commandName (Optional, default `podman`) The command that will be run
     * as the base command. If quoting is necessary, it is the responsibility of the
     * caller to add.
     * @param displayName (Optional, default 'Podman') The human-friendly display
     * name of the client
     * @param description (Optional, with default) The human-friendly description of
     * the client
     */
    public constructor(
        commandName: string = 'podman',
        displayName: string = 'Podman',
        description: string = 'Runs container commands using the Podman CLI'
    ) {
        super(
            PodmanClient.ClientId,
            commandName,
            displayName,
            description
        );
    }

    //#region Version Command

    protected parseVersionCommandOutput(output: string, strict: boolean): Promise<VersionItem> {
        const version = PodmanVersionRecordSchema.parse(JSON.parse(output));

        return Promise.resolve({
            client: version.Client.APIVersion,
            server: version.Server?.APIVersion,
        });
    }

    //#endregion

    //#region Info Command

    protected parseInfoCommandOutput(output: string, strict: boolean): Promise<InfoItem> {
        return Promise.resolve({
            operatingSystem: undefined, // Podman doesn't list an OS in its `info` command
            osType: 'linux',
            raw: output,
        });
    }

    //#endregion

    //#region GetEventStream Command

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

        for await (const line of lineReader) {
            if (cancellationToken.isCancellationRequested) {
                throw new CancellationError('Event stream cancelled', cancellationToken);
            }

            try {
                // Parse a line at a time
                const item = PodmanEventRecordSchema.parse(JSON.parse(line));

                // Yield the parsed data
                yield {
                    type: item.Type,
                    action: item.Status,
                    actor: { id: item.Name, attributes: item.Attributes ?? {} },
                    timestamp: new Date(item.time || item.Time || ''),
                    raw: line,
                };
            } catch (err) {
                if (strict) {
                    throw err;
                }
            }
        }
    }

    //#endregion

    //#region ListImages Command

    protected override parseListImagesCommandOutput(options: ListImagesCommandOptions, output: string, strict: boolean): Promise<ListImagesItem[]> {
        const images = new Array<ListImagesItem>();

        try {
            const rawImages = z.array(PodmanListImageRecordSchema).parse(JSON.parse(output));
            rawImages.forEach((rawImage: PodmanListImageRecord) => {
                try {
                    const createdAt = dayjs.unix(rawImage.Created).toDate();

                    // Podman lists the same image multiple times depending on how many tags it has
                    // So index the name based on how many times we've already seen this image ID
                    const countImagesOfSameId = images.filter(i => i.id === rawImage.Id).length;

                    images.push({
                        id: rawImage.Id,
                        image: parseDockerLikeImageName(rawImage.Names?.[countImagesOfSameId]),
                        // labels: rawImage.Labels || {},
                        createdAt,
                        size: rawImage.Size,
                    });
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }
            });
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return Promise.resolve(images);
    }

    //#endregion

    //#region PruneImages Command

    protected override parsePruneImagesCommandOutput(
        options: PruneImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneImagesItem> {
        return this.resolvePrunedIds(output, (ids) => ({ imageRefsDeleted: ids }));
    }

    //#endregion

    //#region ListContainers Command

    protected override parseListContainersCommandOutput(options: ListContainersCommandOptions, output: string, strict: boolean): Promise<ListContainersItem[]> {
        return this.parseInspectJson(output, strict, (item) => {
            const rawContainer = PodmanListContainerRecordSchema.parse(item);
            const name = rawContainer.Names?.[0].trim();
            const createdAt = dayjs.unix(rawContainer.Created).toDate();
            const ports: PortBinding[] = (rawContainer.Ports ?? []).map(p => {
                return {
                    containerPort: p.container_port,
                    hostIp: p.host_ip || "127.0.0.1",
                    hostPort: p.host_port,
                    protocol: p.protocol,
                };
            });

            return {
                id: rawContainer.Id,
                image: parseDockerLikeImageName(rawContainer.Image),
                name,
                labels: rawContainer.Labels ?? {},
                createdAt,
                ports,
                networks: rawContainer.Networks ?? [],
                state: rawContainer.State,
                status: rawContainer.Status,
            };
        });
    }

    //#endregion

    //#region PruneContainers Command

    protected override parsePruneContainersCommandOutput(
        options: PruneContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneContainersItem> {
        return this.resolvePrunedIds(output, (ids) => ({ containersDeleted: ids }));
    }

    //#endregion

    //#endregion

    //#region ListNetworks Command

    protected override parseListNetworksCommandOutput(options: ListNetworksCommandOptions, output: string, strict: boolean): Promise<ListNetworkItem[]> {
        // Podman networks are drastically different from Docker networks in terms of what details are available
        return this.parseInspectJson(output, strict, (item) => {
            const network = PodmanListNetworkRecordSchema.parse(item);
            return {
                name: network.name || '',
                labels: network.labels ?? {},
                createdAt: network.created ? new Date(network.created) : undefined,
                internal: network.internal,
                ipv6: network.ipv6_enabled,
                driver: network.driver,
                id: network.id,
                scope: undefined, // Not available from Podman
            };
        });
    }

    //#endregion

    //#region PruneNetworks Command

    protected override parsePruneNetworksCommandOutput(
        options: PruneNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneNetworksItem> {
        return this.resolvePrunedIds(output, (ids) => ({ networksDeleted: ids }));
    }

    //#endregion

    //#region InspectNetworks Command

    protected override parseInspectNetworksCommandOutput(options: ListNetworksCommandOptions, output: string, strict: boolean): Promise<InspectNetworksItem[]> {
        // Podman networks are drastically different from Docker networks in terms of what details are available
        return this.parseInspectJson(output, strict, (item) =>
            normalizePodmanInspectNetworkRecord(PodmanInspectNetworkRecordSchema.parse(item), JSON.stringify(item)));
    }

    //#endregion

    //#endregion

    //#region PruneVolumes Command

    protected override parsePruneVolumesCommandOutput(
        options: PruneVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneVolumesItem> {
        return this.resolvePrunedIds(output, (ids) => ({ volumesDeleted: ids }));
    }

    //#endregion
}
