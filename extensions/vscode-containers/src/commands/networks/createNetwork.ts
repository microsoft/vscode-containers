/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext } from '@microsoft/vscode-azext-utils';
import { l10n } from 'vscode';
import { ext } from '../../extensionVariables';
import { isAppleContainerRuntimeSelected } from '../../utils/isAppleContainerRuntimeSelected';
import { getDockerOSType } from '../../utils/osUtils';

export async function createNetwork(context: IActionContext): Promise<void> {

    const name = await context.ui.showInputBox({
        value: '',
        prompt: l10n.t('Name of the network')
    });

    // Apple's `container` has no Docker-style drivers; omitting the driver uses its default plugin.
    let driver: string | undefined;
    if (!isAppleContainerRuntimeSelected()) {
        const osType = await getDockerOSType();

        const drivers: { label: string }[] = osType === 'windows'
            ? [
                { label: 'nat' },
                { label: 'transparent' }
            ]
            : [
                { label: 'bridge' },
                { label: 'host' },
                { label: 'macvlan' }
            ];

        const driverSelection = await context.ui.showQuickPick(
            drivers,
            {
                canPickMany: false,
                placeHolder: l10n.t('Select the network driver to use (default is "bridge").')
            }
        );
        driver = driverSelection.label;
    }

    await ext.runWithDefaults(client =>
        client.createNetwork({ name: name, driver })
    );
}
