/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NoShell } from '@microsoft/vscode-processutils';
import { expect } from 'chai';
import { NerdctlComposeClient } from '../clients/NerdctlComposeClient/NerdctlComposeClient';
import {
    CommonOrchestratorCommandOptions,
    DownCommandOptions,
    UpCommandOptions,
} from '../contracts/ContainerOrchestratorClient';

const commonOptions: CommonOrchestratorCommandOptions = {
    files: ['docker-compose.yml'],
};

describe('(unit) NerdctlComposeClient', () => {
    const client = new NerdctlComposeClient();

    it('Should default to the V2 compose syntax', () => {
        expect(client.composeV2).to.be.true;
    });

    it('Should prefix commands with "compose" and omit the unsupported --timeout flag on up', async () => {
        const options: UpCommandOptions = {
            ...commonOptions,
            detached: true,
            build: true,
            timeoutSeconds: 30, // Not supported by nerdctl compose up - must be dropped
        };

        const response = await client.up(options);
        const args = new NoShell(false).quote(response.args);

        expect(args).to.deep.equal(['compose', '--file', 'docker-compose.yml', 'up', '--detach', '--build']);
        expect(args).to.not.include('--timeout');
    });

    it('Should omit the unsupported --timeout flag on down', async () => {
        const options: DownCommandOptions = {
            ...commonOptions,
            removeVolumes: true,
            timeoutSeconds: 30, // Not supported by nerdctl compose down - must be dropped
        };

        const response = await client.down(options);
        const args = new NoShell(false).quote(response.args);

        expect(args).to.deep.equal(['compose', '--file', 'docker-compose.yml', 'down', '--volumes']);
        expect(args).to.not.include('--timeout');
    });
});
