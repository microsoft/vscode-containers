/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContainersClient } from "../../contracts/ContainerClient";
import { DockerLikeClient } from "../DockerLikeClient/DockerLikeClient";

export class DockerClient extends DockerLikeClient implements IContainersClient {
    readonly id = 'com.microsoft.visualstudio.containers.docker';
    readonly displayName = 'Docker';
    readonly description = 'Runs container commands using the Docker CLI';
    readonly commandName = 'docker';
}
