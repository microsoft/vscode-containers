/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tries to parse a size (in many forms) into a value in bytes
 * @param value The value to try to parse into a size
 */
export function tryParseSize(value: string | number | undefined): number | undefined {
    if (value === undefined || value === null) {
        return undefined;
    } else if (typeof value === 'number') {
        return value;
    } else {
        if (value.toLowerCase() === 'n/a') {
            return undefined;
        } else {
            // Parses values like "1234", "1234b", "1234kb", "1234 MB", etc. into size (the numerical part)
            // and sizeUnit (the kb/mb/gb, if present)
            const result = /(?<size>\d+)\s*(?<sizeUnit>[kmg]?b)?/i.exec(value);

            if (result?.groups?.size) {
                const size: number = Number.parseInt(result.groups.size);
                const unit: string | undefined = result.groups.sizeUnit;

                switch (unit) {
                    case 'kb':
                        return size * 1024;
                    case 'mb':
                        return size * 1024 * 1024;
                    case 'gb':
                        return size * 1024 * 1024 * 1024;
                    default:
                        return size;
                }
            } else {
                return undefined;
            }
        }
    }
}
