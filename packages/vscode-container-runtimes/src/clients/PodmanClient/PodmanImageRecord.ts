/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type PodmanImageRecord = {
    Id: string;
    Names?: Array<string>;
    Created: number;
};

export function isPodmanImageRecord(maybeImage: unknown): maybeImage is PodmanImageRecord {
    const image = maybeImage as PodmanImageRecord;

    if (!image || typeof image !== 'object') {
        return false;
    }

    if (typeof image.Id !== 'string') {
        return false;
    }

    if (!!image.Names && !Array.isArray(image.Names)) {
        return false;
    }

    if (typeof image.Created !== 'number') {
        return false;
    }

    return true;
}
