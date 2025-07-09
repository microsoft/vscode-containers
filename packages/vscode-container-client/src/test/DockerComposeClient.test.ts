/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';

import { DockerComposeClient } from '../clients/DockerComposeClient/DockerComposeClient';
import {
    CommonOrchestratorCommandOptions,
    UpCommandOptions
} from '../contracts/ContainerOrchestratorClient';
import { Bash, Cmd, NoShell, Powershell } from '../utils/Shell';

const commonOptions: CommonOrchestratorCommandOptions = {
    files: ['docker-compose.yml'],
};

describe('(unit) DockerComposeClient', () => {
    const client = new DockerComposeClient();
    client.composeV2 = false;

    it('Should produce the expected lack of quoting/escaping customOptions', async () => {
        const options: UpCommandOptions = {
            ...commonOptions,
            detached: true,
            build: true,
            customOptions: '--timeout 10 --wait'
        };

        const commandResponse = await client.up(options);
        const pwshQuoted = new Powershell().quote(commandResponse.args);
        const cmdQuoted = new Cmd().quote(commandResponse.args);
        const bashQuoted = new Bash().quote(commandResponse.args);
        const noShellQuotedWindows = new NoShell(true).quote(commandResponse.args);
        const noShellQuotedLinux = new NoShell(false).quote(commandResponse.args);

        expect(pwshQuoted).to.deep.equal(['--file', '\'docker-compose.yml\'', 'up', '--detach', '--build', '--timeout 10 --wait']);
        expect(cmdQuoted).to.deep.equal(['--file', '"docker-compose.yml"', 'up', '--detach', '--build', '--timeout 10 --wait']);
        expect(bashQuoted).to.deep.equal(['--file', '\'docker-compose.yml\'', 'up', '--detach', '--build', '--timeout 10 --wait']);
        expect(noShellQuotedWindows).to.deep.equal(['--file', '"docker-compose.yml"', 'up', '--detach', '--build', '--timeout 10 --wait']);
        expect(noShellQuotedLinux).to.deep.equal(['--file', 'docker-compose.yml', 'up', '--detach', '--build', '--timeout 10 --wait']);
    });
});
