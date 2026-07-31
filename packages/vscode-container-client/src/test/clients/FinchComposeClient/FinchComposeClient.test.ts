/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NoShell } from '@microsoft/vscode-processutils';
import { expect } from 'chai';
import { FinchComposeClient } from '../../../clients/FinchComposeClient/FinchComposeClient';
import { NerdctlComposeClient } from '../../../clients/NerdctlComposeClient/NerdctlComposeClient';
import type { UpCommandOptions } from '../../../contracts/ContainerOrchestratorClient';

describe('(unit) FinchComposeClient', () => {
    const client = new FinchComposeClient();

    it('Should use the Finch Compose client ID and not inherit the nerdctl compose one', () => {
        expect(client.id).to.equal(FinchComposeClient.ClientId);
        expect(client.id).to.not.equal(NerdctlComposeClient.ClientId);
    });

    it('Should not change the nerdctl compose client ID', () => {
        expect(new NerdctlComposeClient().id).to.equal(NerdctlComposeClient.ClientId);
    });

    it('Should default to the V2 compose syntax', () => {
        expect(client.composeV2).to.be.true;
    });

    it('Should emit the same command shape as nerdctl compose', async () => {
        const options: UpCommandOptions = {
            files: ['docker-compose.yml'],
            detached: true,
        };

        const args = new NoShell(false).quote((await client.up(options)).args);

        expect(args).to.deep.equal(['compose', '--file', 'docker-compose.yml', 'up', '--detach']);
    });
});
