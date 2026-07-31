/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PortBinding } from '../../contracts/ContainerClient';
import { normalizeIpAddress } from './normalizeIpAddress';

/**
 * Normalize a raw protocol token to the supported set. Returns 'tcp' or 'udp'
 * (case-insensitive) or undefined for anything else (including undefined input).
 */
export function normalizeProtocol(protocol: string | undefined): 'tcp' | 'udp' | undefined {
    switch (protocol?.toLowerCase()) {
        case 'tcp':
            return 'tcp';
        case 'udp':
            return 'udp';
        default:
            return undefined;
    }
}

/**
 * Parse a Docker-style exposed-port key of the form `"<containerPort>/<protocol>"`
 * (e.g. "80/tcp"). Returns the numeric container port and normalized protocol, or
 * undefined when the container port is not a finite integer.
 */
export function parseExposedPortKey(key: string): { containerPort: number; protocol: 'tcp' | 'udp' | undefined } | undefined {
    const [port, protocol] = key.split('/');
    const containerPort = parseInt(port, 10);
    if (!Number.isFinite(containerPort)) {
        return undefined;
    }
    return { containerPort, protocol: normalizeProtocol(protocol) };
}

const shortFormRegex = /^(?<containerPort>\d+)\/(?<protocol>tcp|udp)$/i;

// Supports:
// - hostPort->containerPort[/protocol]
// - hostIp:hostPort->containerPort[/protocol]
// - [ipv6]:hostPort->containerPort[/protocol]
// - bare IPv6 host without brackets, e.g. Docker's `:::8080->80/tcp` wildcard
//   or `::1:8080->80/tcp`. The optional host is captured lazily up to the last
//   `:` before the host port, so embedded IPv6 colons are preserved; brackets
//   (if any) are stripped by normalizeIpAddress.
const longFormRegex = /^(?:(?<host>\[[^\]]*\]|[^\s]*?):)?(?<hostPort>\d+)\s*->\s*(?<containerPort>\d+)(?:\/(?<protocol>tcp|udp))?$/i;

/**
 * Attempt to parse a Docker-like raw port binding string
 * @param portString the raw port string to parse, e.g. "1234/tcp" or "0.0.0.0:1234->1234/udp"
 * @returns Parsed raw port string as a PortBinding record or undefined if invalid
 */
export function parseDockerRawPortString(portString: string): PortBinding | undefined {
    const trimmed = portString.trim();
    if (!trimmed) {
        return undefined;
    }

    const shortMatch = shortFormRegex.exec(trimmed);
    if (shortMatch?.groups) {
        return {
            containerPort: Number.parseInt(shortMatch.groups.containerPort, 10),
            protocol: shortMatch.groups.protocol.toLowerCase() as 'tcp' | 'udp',
        };
    }

    const longMatch = longFormRegex.exec(trimmed);
    if (!longMatch?.groups) {
        return undefined;
    }

    const hostIp = normalizeIpAddress(longMatch.groups.host);
    const protocol = normalizeProtocol(longMatch.groups.protocol) ?? 'tcp';

    return {
        ...(hostIp !== undefined ? { hostIp } : {}),
        hostPort: Number.parseInt(longMatch.groups.hostPort, 10),
        containerPort: Number.parseInt(longMatch.groups.containerPort, 10),
        protocol,
    };
}
