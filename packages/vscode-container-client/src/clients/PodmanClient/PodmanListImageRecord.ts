/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type PodmanListImageRecord = {
    Id: string;
    Names?: Array<string>;
    Size: number;
    Labels?: Record<string, string>;
    Created: number;
};

export function isPodmanListImageRecord(maybeImage: unknown): maybeImage is PodmanListImageRecord {
    const image = maybeImage as PodmanListImageRecord;

    if (!image || typeof image !== 'object') {
        return false;
    }

    if (typeof image.Id !== 'string') {
        return false;
    }

    if (typeof image.Size !== 'number') {
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
