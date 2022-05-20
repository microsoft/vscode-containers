/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PortBinding } from "../../contracts/ContainerClient";

/**
 * Attempt to parse a Docker-like raw port binding string
 * @param portString the raw port string to parse
 * @returns Parsed raw port string as a PortBinding record or undefined if invalid
 */
export function parseDockerRawPortString(portString: string): PortBinding | undefined {
    const [hostInfo, rawContainerPort, protocol] = portString.split(/->|\//);

    if (protocol !== 'tcp' && protocol !== 'udp') {
        return;
    }

    const containerPort = parseInt(rawContainerPort);
    if (containerPort <= 0) {
        return;
    }

    const hostPortIndex = hostInfo.lastIndexOf(':');
    const hostIp = hostInfo.slice(0, hostPortIndex);
    const rawHostPort = hostInfo.slice(hostPortIndex + 1);

    const hostPort = parseInt(rawHostPort);
    if (hostPort <= 0) {
        return;
    }

    return {
        hostIp: hostIp,
        containerPort: containerPort,
        hostPort: hostPort,
        protocol,
    };
}
