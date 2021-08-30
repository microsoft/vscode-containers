/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface SpannedGroup {
    index: number;
    length: number;
    value: string | undefined;
}

/**
 * Note: this will not work for groups with any overlap
 */
export function computeRegExpSpans(execArray: RegExpExecArray): SpannedGroup[] {
    // The first group is always the full matched string
    const results: SpannedGroup[] = [
        {
            index: execArray.index,
            length: execArray[0].length,
            value: execArray[0],
        }
    ];

    // Subsequent groups are determined by looking *after* the end of the previous group
    let lastIndex = execArray.index;
    for (const group of execArray.slice(1)) {
        const index = group ? execArray.input.indexOf(group, lastIndex) : -1;
        const length = group?.length ?? 0;

        results.push({
            index,
            length,
            value: group
        });

        lastIndex = index + length;
    }

    return results;
}
