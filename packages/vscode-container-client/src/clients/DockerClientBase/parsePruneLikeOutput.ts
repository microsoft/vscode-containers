/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tryParseSize } from "./tryParseSize";

// default regex to parse the space reclaimed
const PruneSpaceReclaimedRegex = /Total reclaimed space:\s+([\w\s]+)/igm;
const ResourceRegex = /^\w+$/igm;

export type PruneParseOptions = {
    // if resource regex is not provided, we'll assume the resource is the line itself
    resourceRegex?: RegExp;
};

export type PruneResult = {
    spaceReclaimed: number;
    resources: string[];
};

export function parsePruneLikeOutput(output: string, options: PruneParseOptions): PruneResult {
    const resourceRegex = options?.resourceRegex || ResourceRegex;

    let deletedResources: string[] = [];
    let spaceReclaimed: number = 0;

    // match resources
    deletedResources = output.match(resourceRegex) || [];

    // match space reclaimed
    const spaceMatched = PruneSpaceReclaimedRegex.exec(output)?.[0];
    spaceReclaimed = tryParseSize(spaceMatched) || 0;

    return {
        spaceReclaimed: spaceReclaimed,
        resources: deletedResources,
    };
}

