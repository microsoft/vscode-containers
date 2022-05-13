/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as dayjs from 'dayjs';
import * as customParseFormat from 'dayjs/plugin/customParseFormat';
import * as utc from 'dayjs/plugin/utc';

import {
    BuildImageCommandOptions,
    CommandResponse,
    CreateVolumeCommandOptions,
    ExecContainerCommandOptions,
    IContainersClient,
    InspectContainersCommandOptions,
    InspectContainersItem,
    InspectImagesCommandOptions,
    InspectImagesItem,
    ListContainersCommandOptions,
    ListContainersItem,
    ListImagesCommandOptions,
    ListImagesItem,
    ListVolumeItem,
    ListVolumesCommandOptions,
    LogsForContainerCommandOptions,
    PruneImagesCommandOptions,
    PullImageCommandOptions,
    RemoveContainersCommandOptions,
    RemoveVolumesCommandOptions,
    RunContainerCommandOptions,
    StopContainersCommandOptions,
    TagImageCommandOptions,
    VersionCommandOptions,
    VersionItem,
} from '../contracts/ContainerClient';
import { DockerClient } from './DockerClient';

dayjs.extend(customParseFormat);
dayjs.extend(utc);

const PODMAN_COMMAND: string = 'podman';
const ROOTLESS_NETWORK_MODE = 'slirp4netns';

function parseImageRepository(repository: string): [string, string, string] {
    let index = repository.indexOf('/');
    if (index < 0) {
        throw new Error('Invalid image format: missing registry');
    }

    const registry = repository.substring(0, index);
    const nameAndTag = repository.substring(index + 1);

    index = nameAndTag.lastIndexOf(':');
    if (index < 0) {
        throw new Error('Invalid image format: missing tag');
    }

    const name = nameAndTag.substring(0, index);
    const tag = nameAndTag.substring(index + 1);

    return [registry, name, tag];
}

type PodmanVersion = {
    Client: { APIVersion: string };
    Server?: { APIVersion: string };
};

function isPodmanVersion(maybeVersion: unknown): maybeVersion is PodmanVersion {
    const version = maybeVersion as PodmanVersion;

    if (typeof version !== 'object') {
        return false;
    }

    if (typeof version.Client !== 'object') {
        return false;
    }

    if (typeof version.Client.APIVersion !== 'string') {
        return false;
    }

    if (typeof version.Server === 'object' && typeof version.Server.APIVersion !== 'string') {
        return false;
    }

    return true;
}

type PodmanImage = {
    Id: string;
    Names: Array<string>;
    Created: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPodmanImage(maybeImage: any): maybeImage is PodmanImage {
    if (!maybeImage || typeof maybeImage !== 'object') {
        return false;
    }

    if (typeof maybeImage.Id !== 'string') {
        return false;
    }

    if (!Array.isArray(maybeImage.Names) && maybeImage.Names.length < 1) {
        return false;
    }

    if (typeof maybeImage.Created !== 'number') {
        return false;
    }

    return true;
}

type PodmanVolume = {
    Name: string;
    Driver: string;
    Labels: Record<string, string>;
    Mountpoint: string;
    Scope: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPodmanVolume(maybeVolume: any): maybeVolume is PodmanVolume {
    if (!maybeVolume || typeof maybeVolume !== 'object') {
        return false;
    }

    if (typeof maybeVolume.Name !== 'string') {
        return false;
    }

    if (typeof maybeVolume.Driver !== 'string') {
        return false;
    }

    if (!maybeVolume.Labels || typeof maybeVolume.Labels !== 'object') {
        return false;
    }

    if (typeof maybeVolume.Mountpoint !== 'string') {
        return false;
    }

    if (typeof maybeVolume.Scope !== 'string') {
        return false;
    }

    return true;
}

export class PodmanClient implements IContainersClient {
    readonly id = 'com.microsoft.visualstudio.containers.podman';
    readonly displayName = 'Podman';
    readonly description = 'Runs container commands using the Podman CLI';

    // Version Command

    async version(options?: VersionCommandOptions): Promise<CommandResponse<VersionItem>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getVersionArgs(options),
            parse: async (output, strict) => {
                const version = JSON.parse(output);
                if (!isPodmanVersion(version)) {
                    throw new Error('Invalid version JSON');
                }

                return {
                    client: version.Client.APIVersion,
                    server: version.Server?.APIVersion,
                };
            },
        };
    }

    // Image Commands

    async buildImage(options: BuildImageCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getBuildImageArgs(options),
            parse: (output, strict) => Promise.resolve(),
        };
    }

    async listImages(options: ListImagesCommandOptions): Promise<CommandResponse<Array<ListImagesItem>>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getListImagesArgs(options),
            parse: async (output, strict) => {
                const images = new Array<ListImagesItem>();
                try {
                    const rawImages = JSON.parse(output);
                    rawImages.forEach((rawImage: unknown) => {
                        try {
                            if (!isPodmanImage(rawImage)) {
                                throw new Error('Invalid image JSON');
                            }

                            const [registry, imageName, tag] = parseImageRepository(rawImage.Names[0]);
                            const createdAt = dayjs.unix(rawImage.Created).toDate();

                            const image = registry ? `${registry}/${imageName}:${tag}` : `${imageName}:${tag}`;

                            images.push({
                                id: rawImage.Id,
                                image,
                                registry,
                                name: imageName,
                                tag,
                                createdAt,
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
        };
    }

    async pruneImages(options: PruneImagesCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getPruneImagesArgs(options),
            parse: (output, strict) => Promise.resolve(),
        };
    }

    async pullImage(options: PullImageCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getPullImageArgs(options),
            parse: (output, strict) => Promise.resolve(),
        };
    }

    async tagImage(options: TagImageCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getTagImageArgs(options),
            parse: (output, strict) => Promise.resolve(),
        };
    }

    async inspectImages(options: InspectImagesCommandOptions): Promise<CommandResponse<InspectImagesItem[]>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getInspectImagesArgs(options),
            parse: DockerClient.parseInspectImagesOutput,
        };
    }

    // Container Commands

    async runContainer(options: RunContainerCommandOptions): Promise<CommandResponse<string | undefined>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getRunContainerArgs(options),
            parse: async (output, strict) => options.detached ? output.split('\n', 1)[0] : output,
        };
    }

    async execContainer(options: ExecContainerCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getExecContainerArgs(options),
            parse: (output, strict) => Promise.resolve(),
        };
    }

    async listContainers(options: ListContainersCommandOptions): Promise<CommandResponse<Array<ListContainersItem>>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getListContainersArgs(options),
            parse: DockerClient.parseListContainersOutput,
        };
    }

    async stopContainers(options: StopContainersCommandOptions): Promise<CommandResponse<Array<string>>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getStopContainersArgs(options),
            parse: async (output, strict) => {
                return output.split('\n').filter((id) => id);
            },
        };
    }

    async removeContainers(options: RemoveContainersCommandOptions): Promise<CommandResponse<Array<string>>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getRemoveContainersArgs(options),
            parse: async (output, strict) => {
                return output.split('\n').filter((id) => id);
            },
        };
    }

    async logsForContainer(options: LogsForContainerCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getLogsForContainerArgs(options),
            parse: (output, string) => Promise.resolve(),
        };
    }

    async inspectContainers(options: InspectContainersCommandOptions): Promise<CommandResponse<InspectContainersItem[]>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getInspectContainersArgs(
                options, {
                Platform: '"linux"',
                // .NetworkSettings.Networks isn't defined for rootless containers (NetworkMode == slirp4netns)
                Networks: `{{if eq .HostConfig.NetworkMode "${ROOTLESS_NETWORK_MODE}}"}}null{{else}}{{json .NetworkSettings.Networks}}{{end}}`,
            }), // Platform is always linux for Podman
            parse: DockerClient.parseInspectContainersOutput,
        };
    }

    // Volume Commands

    async createVolume(options: CreateVolumeCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getCreateVolumeArgs(options),
            parse: (output, string) => Promise.resolve(),
        };
    }

    async listVolumes(options: ListVolumesCommandOptions): Promise<CommandResponse<ListVolumeItem[]>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getListVolumesArgs(options),
            parse: async (output, strict) => {
                const volumes = new Array<ListVolumeItem>();
                try {
                    const rawVolumes = JSON.parse(output);
                    rawVolumes.forEach((volumeJson: string) => {
                        try {
                            if (!volumeJson && typeof volumeJson !== 'string') {
                                return;
                            }

                            const rawVolume = JSON.parse(volumeJson);

                            if (!isPodmanVolume(rawVolume)) {
                                throw new Error('Invalid volume JSON');
                            }


                            volumes.push({
                                name: rawVolume.Name,
                                driver: rawVolume.Driver,
                                labels: rawVolume.Labels,
                                mountpoint: rawVolume.Mountpoint,
                                scope: rawVolume.Scope,
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

                return volumes;
            },
        };
    }

    async removeVolumes(options: RemoveVolumesCommandOptions): Promise<CommandResponse<string[]>> {
        return {
            command: PODMAN_COMMAND,
            args: DockerClient.getRemoveVolumesArgs(options),
            parse: async (output, strict) => {
                return output.split('\n').filter(id => id);
            },
        };
    }
}
