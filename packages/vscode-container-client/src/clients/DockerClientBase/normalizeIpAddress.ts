/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * If the IP address is v4, it will not be changed. If it is v6, we will remove the `[]` if present.
 * If the input is falsy, it will return `undefined`.
 * @param ip IP address to normalize
 */
export function normalizeIpAddress(ip: string | undefined): string | undefined {
    if (!ip) {
        return undefined;
    }

    return ip.replace(/^\[|\]$/g, '');
}
