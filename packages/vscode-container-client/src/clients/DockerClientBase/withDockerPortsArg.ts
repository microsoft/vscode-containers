/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { withNamedArg } from "@microsoft/vscode-processutils";
import { PortBinding } from "../../contracts/ContainerClient";

export function withDockerPortsArg(ports?: Array<PortBinding>) {
    return withNamedArg(
        '--publish',
        (ports ?? []).map((port) => {
            let binding = port.hostIp ? `${port.hostIp}:` : '';
            binding += `${port.hostPort || ''}:`;
            binding += port.containerPort;
            if (port.protocol) {
                binding += `/${port.protocol}`;
            }
            return binding;
        }),
    );
}
