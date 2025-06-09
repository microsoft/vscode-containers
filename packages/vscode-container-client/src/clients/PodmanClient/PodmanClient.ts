/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as readline from 'readline';
import {
    EventItem,
    EventStreamCommandOptions,
    IContainersClient,
    InfoItem,
    InspectContainersCommandOptions,
    InspectContainersItem,
    InspectImagesCommandOptions,
    InspectImagesItem,
    InspectNetworksItem,
    InspectVolumesItem,
    ListContainersCommandOptions,
    ListContainersItem,
    ListImagesCommandOptions,
    ListImagesItem,
    ListNetworkItem,
    ListNetworksCommandOptions,
    ListVolumeItem,
    ListVolumesCommandOptions,
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
import { asIds } from '../../utils/asIds';
import { CancellationError } from '../../utils/CancellationError';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { CancellationTokenLike } from '../../typings/CancellationTokenLike';
import { DockerClientBase } from '../DockerClientBase/DockerClientBase';
import { PodmanEventRecordSchema } from './PodmanEventRecord';
import { PodmanInspectContainerRecordSchema, normalizePodmanInspectContainerRecord } from './PodmanInspectContainerRecord';
import { PodmanInspectImageRecordSchema, normalizePodmanInspectImageRecord } from './PodmanInspectImageRecord';
import { PodmanInspectNetworkRecordSchema, normalizePodmanInspectNetworkRecord } from './PodmanInspectNetworkRecord';
import { PodmanInspectVolumeRecordSchema, normalizePodmanInspectVolumeRecord } from './PodmanInspectVolumeRecord';
import { PodmanListContainerRecord, PodmanListContainerRecordSchema } from './PodmanListContainerRecord';
import { PodmanListImageRecord, PodmanListImageRecordSchema } from './PodmanListImageRecord';
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

    protected async parseVersionCommandOutput(output: string, strict: boolean): Promise<VersionItem> {
        const version = PodmanVersionRecordSchema.parse(JSON.parse(output));

        return {
            client: version.Client.APIVersion,
            server: version.Server?.APIVersion,
        };
    }

    //#endregion

    //#region Info Command

    protected async parseInfoCommandOutput(output: string, strict: boolean): Promise<InfoItem> {
        return {
            operatingSystem: undefined, // Podman doesn't list an OS in its `info` command
            osType: 'linux',
            raw: output,
        };
    }

    //#endregion

    //#region GetEventStream Command

    protected override async *parseEventStreamCommandOutput(
        options: EventStreamCommandOptions,
        output: NodeJS.ReadableStream,
        strict: boolean,
        cancellationToken?: CancellationTokenLike
    ): AsyncGenerator<EventItem> {
        cancellationToken ||= CancellationTokenLike.None;

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
                    actor: { id: item.Name, attributes: item.Attributes || {} },
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

    protected override async parseListImagesCommandOutput(options: ListImagesCommandOptions, output: string, strict: boolean): Promise<ListImagesItem[]> {
        const images = new Array<ListImagesItem>();

        try {
            const rawImages = PodmanListImageRecordSchema.array().parse(JSON.parse(output));
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

        return images;
    }

    //#endregion

    //#region PruneImages Command

    protected override parsePruneImagesCommandOutput(
        options: PruneImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneImagesItem> {
        return Promise.resolve({
            imageRefsDeleted: asIds(output),
        });
    }

    //#endregion

    //#region InspectImages Command

    /**
     * Parse the standard output from a Docker-like inspect images command and
     * normalize the result
     * @param options Inspect images command options
     * @param output The standard out from a Docker-like runtime inspect images command
     * @param strict Should strict parsing be enforced?
     * @returns Normalized array of InspectImagesItem records
     */
    protected async parseInspectImagesCommandOutput(
        options: InspectImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectImagesItem>> {
        const results = new Array<InspectImagesItem>();

        try {
            const resultRaw = PodmanInspectImageRecordSchema.array().parse(JSON.parse(output));

            for (const inspect of resultRaw) {
                results.push(normalizePodmanInspectImageRecord(inspect, output));
            }
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return results;
    }

    //#endregion

    //#region ListContainers Command

    protected override async parseListContainersCommandOutput(options: ListContainersCommandOptions, output: string, strict: boolean): Promise<ListContainersItem[]> {
        const containers = new Array<ListContainersItem>();

        try {
            const rawContainers = PodmanListContainerRecordSchema.array().parse(JSON.parse(output));
            rawContainers.forEach((rawContainer: PodmanListContainerRecord) => {
                try {
                    const name = rawContainer.Names?.[0].trim();
                    const createdAt = dayjs.unix(rawContainer.Created).toDate();
                    const ports: PortBinding[] = (rawContainer.Ports || []).map(p => {
                        return {
                            containerPort: p.container_port,
                            hostIp: p.host_ip || "127.0.0.1",
                            hostPort: p.host_port,
                            protocol: p.protocol,
                        };
                    });

                    containers.push({
                        id: rawContainer.Id,
                        image: parseDockerLikeImageName(rawContainer.Image),
                        name,
                        labels: rawContainer.Labels || {},
                        createdAt,
                        ports,
                        networks: rawContainer.Networks || [],
                        state: rawContainer.State,
                        status: rawContainer.Status,
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

        return containers;
    }

    //#endregion

    //#region PruneContainers Command

    protected override parsePruneContainersCommandOutput(
        options: PruneContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneContainersItem> {
        return Promise.resolve({
            containersDeleted: asIds(output),
        });
    }

    //#endregion

    //#region InspectContainers Command

    protected override async parseInspectContainersCommandOutput(options: InspectContainersCommandOptions, output: string, strict: boolean): Promise<InspectContainersItem[]> {
        const results = new Array<InspectContainersItem>();

        try {
            const resultRaw = PodmanInspectContainerRecordSchema.array().parse(JSON.parse(output));

            for (const inspect of resultRaw) {
                results.push(normalizePodmanInspectContainerRecord(inspect, output));
            }
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return results;
    }

    //#endregion

    //#region ListNetworks Command

    protected override async parseListNetworksCommandOutput(options: ListNetworksCommandOptions, output: string, strict: boolean): Promise<ListNetworkItem[]> {
        // Podman networks are drastically different from Docker networks in terms of what details are available, especially Podman v3
        const results = new Array<ListNetworkItem>();

        try {
            const resultRaw = PodmanListNetworkRecordSchema.array().parse(JSON.parse(output));

            for (const network of resultRaw) {
                results.push({
                    name: network.name || network.Name || '',
                    labels: network.Labels || {},
                    createdAt: network.created ? new Date(network.created) : undefined,
                    internal: network.internal,
                    ipv6: network.ipv6_enabled,
                    driver: network.driver,
                    id: network.id,
                    scope: undefined, // Not available from Podman
                });
            }
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return results;
    }

    //#endregion

    //#region PruneNetworks Command

    protected override parsePruneNetworksCommandOutput(
        options: PruneNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneNetworksItem> {
        return Promise.resolve({
            networksDeleted: asIds(output),
        });
    }

    //#endregion

    //#region InspectNetworks Command

    protected override async parseInspectNetworksCommandOutput(options: ListNetworksCommandOptions, output: string, strict: boolean): Promise<InspectNetworksItem[]> {
        // Podman networks are drastically different from Docker networks in terms of what details are available, especially Podman v3
        const results = new Array<InspectNetworksItem>();

        try {
            const resultRaw = PodmanInspectNetworkRecordSchema.array().parse(JSON.parse(output));

            for (const network of resultRaw) {
                results.push(normalizePodmanInspectNetworkRecord(network, output));
            }
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return results;
    }

    //#endregion

    //#region ListVolumes Command

    protected override async parseListVolumesCommandOutput(options: ListVolumesCommandOptions, output: string, strict: boolean): Promise<ListVolumeItem[]> {
        // Podman volume inspect is identical to volume list
        return this.parseInspectVolumesCommandOutput(options, output, strict);
    }

    //#endregion

    //#region PruneVolumes Command

    protected override parsePruneVolumesCommandOutput(
        options: PruneVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneVolumesItem> {
        return Promise.resolve({
            volumesDeleted: asIds(output),
        });
    }

    //#endregion

    //#region InspectVolumes Command

    protected override async parseInspectVolumesCommandOutput(options: ListVolumesCommandOptions, output: string, strict: boolean): Promise<InspectVolumesItem[]> {
        const results = new Array<InspectVolumesItem>();

        try {
            const resultRaw = PodmanInspectVolumeRecordSchema.array().parse(JSON.parse(output));

            for (const volume of resultRaw) {
                results.push(normalizePodmanInspectVolumeRecord(volume, output));
            }
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return results;
    }
}
