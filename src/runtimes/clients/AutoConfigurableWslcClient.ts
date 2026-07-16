/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WslcClient } from '@microsoft/vscode-container-client';
import { configPrefix } from '../../constants';
import { ext } from '../../extensionVariables';
import { AutoConfigurableClient } from './AutoConfigurableClient';

/**
 * IMPORTANT NOTE: This class mirrors {@link AutoConfigurableDockerClient} and
 * {@link AutoConfigurablePodmanClient} in shape, but deliberately ignores the
 * shared `containers.containerCommand` setting: wslc is a specifically named
 * binary on the user's PATH and overriding the executable name only makes
 * sense for the docker/podman aliases.
 *
 * WSLC (Windows Subsystem for Linux Container CLI) is only available on Windows;
 * this client is only registered on Windows hosts.
 */
export class AutoConfigurableWslcClient extends WslcClient implements AutoConfigurableClient {
    public constructor() {
        super();
        this.reconfigure();
    }

    public reconfigure(): void {
        this.commandName = 'wslc';
        ext.outputChannel.debug(`${configPrefix}: WSLC client command pinned to '${this.commandName}'`);
    }
}
