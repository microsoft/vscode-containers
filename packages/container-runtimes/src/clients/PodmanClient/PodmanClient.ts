/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dayjs from 'dayjs';
import * as customParseFormat from 'dayjs/plugin/customParseFormat';
import * as utc from 'dayjs/plugin/utc';
import {
    IContainersClient,
    InspectContainersCommandOptions,
    ListImagesCommandOptions,
    ListImagesItem,
    ListVolumeItem,
    ListVolumesCommandOptions,
    VersionItem
} from '../../contracts/ContainerClient';
import { CommandLineArgs } from '../../utils/commandLineBuilder';
import { DockerLikeClient } from '../DockerLikeClient/DockerLikeClient';
import { parseDockerImageRepository } from '../DockerLikeClient/parseDockerImageRepository';
import { isPodmanImageRecord } from './PodmanImageRecord';
import { isPodmanVersionRecord } from './PodmanVersionRecord';
import { isPodmanVolumeRecord } from './PodmanVolumeRecord';

dayjs.extend(customParseFormat);
dayjs.extend(utc);

const ROOTLESS_NETWORK_MODE = 'slirp4netns';

// @ts-expect-error TODO: It doesn't fully implement the interface right now
export class PodmanClient extends DockerLikeClient implements IContainersClient {
    readonly id = 'com.microsoft.visualstudio.containers.podman';
    readonly displayName = 'Podman';
    readonly description = 'Runs container commands using the Podman CLI';
    readonly commandName = 'podman';

    //#region Version Command

    protected async parseVersionCommandOutput(output: string, strict: boolean): Promise<VersionItem> {
        const version = JSON.parse(output);
        if (!isPodmanVersionRecord(version)) {
            throw new Error('Invalid version JSON');
        }

        return {
            client: version.Client.APIVersion,
            server: version.Server?.APIVersion,
        };
    }

    //#endregion

    //#region ListImages Command

    protected override async parseListImagesCommandOutput(options: ListImagesCommandOptions, output: string, strict: boolean): Promise<ListImagesItem[]> {
        const images = new Array<ListImagesItem>();
        try {
            const rawImages = JSON.parse(output);
            rawImages.forEach((rawImage: unknown) => {
                try {
                    if (!isPodmanImageRecord(rawImage)) {
                        throw new Error('Invalid image JSON');
                    }

                    const [registry, imageName, tag] = rawImage.Names?.length
                        ? parseDockerImageRepository(rawImage.Names[0])
                        : [undefined, undefined, undefined];
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

    //#endregion

    //#region InspectContainers Command

    protected override getInspectContainersCommandArgs(options: InspectContainersCommandOptions): CommandLineArgs {
        return this.getInspectContainersCommandArgsCore(
            options,
            {
                // Podman omits a value for platform, but it should always be linux
                Platform: '"linux"',
                // .NetworkSettings.Networks isn't defined for rootless containers (NetworkMode == slirp4netns) which results in an error
                Networks: `{{if eq .HostConfig.NetworkMode "${ROOTLESS_NETWORK_MODE}}"}}null{{else}}{{json .NetworkSettings.Networks}}{{end}}`,
            });
    }

    //#endregion

    //#region ListVolumes Command

    protected override async parseListVolumesCommandOputput(options: ListVolumesCommandOptions, output: string, strict: boolean): Promise<ListVolumeItem[]> {
        const volumes = new Array<ListVolumeItem>();
        try {
            const rawVolumes = JSON.parse(output);
            rawVolumes.forEach((volumeJson: string) => {
                try {
                    if (!volumeJson && typeof volumeJson !== 'string') {
                        return;
                    }

                    const rawVolume = JSON.parse(volumeJson);

                    if (!isPodmanVolumeRecord(rawVolume)) {
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
    }

    //#endregion
}
