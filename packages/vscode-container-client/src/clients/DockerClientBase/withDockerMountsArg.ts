/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { withNamedArg } from "@microsoft/vscode-processutils";
import { RunContainerMount } from "../../contracts/ContainerClient";

export function formatDockerMount(mount: RunContainerMount): string {
    const mountParts = new Array<string>(
        `type=${mount.type}`,
        `source=${mount.source}`,
        `destination=${mount.destination}`,
        mount.readOnly ? 'readonly' : '',
    );

    return mountParts.filter((part) => !!part).join(',');
}

export function withDockerMountsArg(mounts?: Array<RunContainerMount>) {
    return withNamedArg('--mount', (mounts || []).map(formatDockerMount));
}
