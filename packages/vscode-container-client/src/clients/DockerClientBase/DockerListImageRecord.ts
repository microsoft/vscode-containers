/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as z from 'zod/mini';
import { ListImagesItem } from '../../contracts/ContainerClient';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { tryParseSize } from './tryParseSize';

export const DockerListImageRecordSchema = z.object({
    ID: z.string(),
    Repository: z.string(),
    Tag: z.string(),
    CreatedAt: z.string(),
    Size: z.union([z.string(), z.number()]),
});

type DockerListImageRecord = z.infer<typeof DockerListImageRecordSchema>;

export function normalizeDockerListImageRecord(image: DockerListImageRecord): ListImagesItem {
    const createdAt = dayjs.utc(image.CreatedAt).toDate();
    const size = tryParseSize(image.Size);

    const repositoryAndTag = `${image.Repository}${image.Tag ? `:${image.Tag}` : ''}`;

    return {
        id: image.ID,
        image: parseDockerLikeImageName(repositoryAndTag),
        // labels: {}, // TODO: image labels are conspicuously absent from Docker image listing output
        createdAt,
        size,
    };
}
