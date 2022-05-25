/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const NONE = '<none>';

/**
 * Parse the full image name and return a tuple of the parts
 * @param repository The full name of the image (registry/name:tag)
 * @returns A tuple of [registry, name, tag]
 */
export function parseDockerImageRepository(repository: string): [string | undefined, string | undefined, string | undefined] {
    let index = repository.indexOf('/');

    const registry = index > -1 ? repository.substring(0, index) : undefined;
    const nameAndTag = index > -1 ? repository.substring(index + 1) : repository;

    index = nameAndTag.lastIndexOf(':');

    let name: string | undefined = index > -1 ? nameAndTag.substring(0, index) : nameAndTag;
    let tag: string | undefined = index > -1 ? nameAndTag.substring(index + 1) : undefined;

    if (name?.toLowerCase() === NONE) {
        name = undefined;
    }

    if (tag?.toLowerCase() === NONE) {
        tag = undefined;
    }

    return [registry, name, tag];
}
