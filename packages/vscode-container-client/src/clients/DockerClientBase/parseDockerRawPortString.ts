/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PortBinding } from '../../contracts/ContainerClient';
import { normalizeIpAddress } from './normalizeIpAddress';

/**
 * Normalize a raw protocol token to the supported set. Returns 'tcp', 'udp', or 'sctp'
 * (case-insensitive) or undefined for anything else (including undefined input).
 */
export function normalizeProtocol(protocol: string | undefined): PortBinding['protocol'] {
    switch (protocol?.toLowerCase()) {
        case 'tcp':
            return 'tcp';
        case 'udp':
            return 'udp';
        case 'sctp':
            return 'sctp';
        default:
            return undefined;
    }
}

/**
 * Parse a Docker-style exposed-port key of the form `"<containerPort>/<protocol>"`
 * (e.g. "80/tcp"). Returns the numeric container port and normalized protocol, or
 * undefined when the container port is not a finite integer.
 */
export function parseExposedPortKey(key: string): Pick<PortBinding, 'containerPort' | 'protocol'> | undefined {
    const [port, protocol] = key.split('/');
    const containerPort = parseInt(port, 10);
    if (!Number.isFinite(containerPort)) {
        return undefined;
    }
    return { containerPort, protocol: normalizeProtocol(protocol) };
}

const shortFormRegex = /^(?<containerPortStart>\d+)(?:-(?<containerPortEnd>\d+))?\/(?<protocol>tcp|udp|sctp)$/i;

// Supports:
// - hostPort->containerPort[/protocol]
// - hostIp:hostPort->containerPort[/protocol]
// - [ipv6]:hostPort->containerPort[/protocol]
// - bare IPv6 host without brackets, e.g. Docker's `:::8080->80/tcp` wildcard
//   or `::1:8080->80/tcp`. The optional host is captured lazily up to the last
//   `:` before the host port, so embedded IPv6 colons are preserved; brackets
//   (if any) are stripped by normalizeIpAddress.
const longFormRegex = /^(?:(?<host>\[[^\]]*\]|[^\s]*?):)?(?<hostPortStart>\d+)(?:-(?<hostPortEnd>\d+))?\s*->\s*(?<containerPortStart>\d+)(?:-(?<containerPortEnd>\d+))?(?:\/(?<protocol>tcp|udp|sctp))?$/i;

/**
 * Parse and expand a Docker-like raw port binding string.
 * @param portString the raw port string to parse, e.g. "1234/tcp" or "0.0.0.0:1234->1234/udp"
 * @returns Parsed bindings, or undefined if invalid
 */
export function expandDockerRawPortString(portString: string): PortBinding[] | undefined {
    const trimmed = portString.trim();
    if (!trimmed) {
        return undefined;
    }

    const shortMatch = shortFormRegex.exec(trimmed);
    if (shortMatch?.groups) {
        const containerPortStart = Number.parseInt(shortMatch.groups.containerPortStart, 10);
        const containerPortEnd = shortMatch.groups.containerPortEnd
            ? Number.parseInt(shortMatch.groups.containerPortEnd, 10)
            : containerPortStart;
        if (!isValidPortRange(containerPortStart, containerPortEnd)) {
            return undefined;
        }

        const protocol = normalizeProtocol(shortMatch.groups.protocol);
        return Array.from(
            { length: containerPortEnd - containerPortStart + 1 },
            (_, offset) => ({ containerPort: containerPortStart + offset, protocol }),
        );
    }

    const longMatch = longFormRegex.exec(trimmed);
    if (!longMatch?.groups) {
        return undefined;
    }

    const hostPortStart = Number.parseInt(longMatch.groups.hostPortStart, 10);
    const hostPortEnd = longMatch.groups.hostPortEnd
        ? Number.parseInt(longMatch.groups.hostPortEnd, 10)
        : hostPortStart;
    const containerPortStart = Number.parseInt(longMatch.groups.containerPortStart, 10);
    const containerPortEnd = longMatch.groups.containerPortEnd
        ? Number.parseInt(longMatch.groups.containerPortEnd, 10)
        : containerPortStart;
    const hostRangeLength = hostPortEnd - hostPortStart;
    const containerRangeLength = containerPortEnd - containerPortStart;
    if (
        !isValidPortRange(hostPortStart, hostPortEnd)
        || !isValidPortRange(containerPortStart, containerPortEnd)
        || hostRangeLength !== containerRangeLength
    ) {
        return undefined;
    }

    const hostIp = normalizeIpAddress(longMatch.groups.host);
    const protocol = normalizeProtocol(longMatch.groups.protocol) ?? 'tcp';
    return Array.from(
        { length: containerRangeLength + 1 },
        (_, offset) => ({
            ...(hostIp !== undefined ? { hostIp } : {}),
            hostPort: hostPortStart + offset,
            containerPort: containerPortStart + offset,
            protocol,
        }),
    );
}

const maxPort = 65535;

function isValidPortRange(start: number, end: number): boolean {
    return Number.isSafeInteger(start)
        && Number.isSafeInteger(end)
        && start >= 0
        && end >= start
        && end <= maxPort;
}
