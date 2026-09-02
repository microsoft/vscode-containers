/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { exec } from 'child_process';
import { describe, it } from 'mocha';
import { promisify } from 'util';
import { WslcClient } from '../../../clients/WslcClient/WslcClient';
import { type ClientType } from '../../e2eShared';

const execAsync = promisify(exec);

const clientTypeToTest: ClientType = (process.env.CONTAINER_CLIENT_TYPE || 'docker') as ClientType;

// Invoke wslc by its default command name so the canaries follow the client if that ever changes.
const wslcCommand = new WslcClient().commandName;

interface WslcCliResult {
    stdout: string;
    stderr: string;
}

/**
 * Runs `wslc <args>` and returns its stdout/stderr. wslc exits 0 even for unrecognized commands
 * (it writes `Unrecognized command: '<name>'` to stderr), so these canaries never rely on the exit
 * code. If a future release ever exits non-zero, `exec` attaches the captured streams to the thrown
 * error, which we unwrap so the assertions still see the output.
 */
async function runWslc(args: string): Promise<WslcCliResult> {
    try {
        return await execAsync(`${wslcCommand} ${args}`);
    } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        return { stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
}

/**
 * "Canary" tests that pass while wslc LACKS a capability the {@link WslcClient} currently works
 * around, and FAIL once a future wslc release adds it — signaling that the corresponding override
 * or guard in {@link WslcClient} should be replaced with real support. Every assertion probes the
 * real `wslc` CLI, so this suite only runs against the wslc integration matrix and is skipped for
 * all other runtimes.
 *
 * `--help` is appended to every probe so that a command which becomes real does not accidentally
 * run (and potentially block), it simply prints help instead.
 */
describe('(integration) WslcCanary', function () {
    this.timeout(20000);

    before(function () {
        if (clientTypeToTest !== 'wslc') {
            this.skip();
        }
    });

    // Subcommands wslc doesn't implement. It reports `Unrecognized command: '<name>'` on stderr;
    // when it implements one, that message disappears and the matching canary fails.
    describe('unsupported subcommands', function () {
        const cases: Array<{ description: string; args: string; unrecognizedToken: string; workaround: string }> = [
            { description: '`events`', args: 'events --help', unrecognizedToken: 'events', workaround: 'WslcClient.getEventStream rejects with CommandNotSupportedError' },
            { description: '`info`', args: 'info --help', unrecognizedToken: 'info', workaround: 'WslcClient.getInfoCommandArgs/parseInfoCommandOutput synthesize a linux InfoItem' },
            { description: '`container restart`', args: 'container restart --help', unrecognizedToken: 'restart', workaround: 'WslcClient.restartContainers rejects with CommandNotSupportedError' },
        ];

        cases.forEach(({ description, args, unrecognizedToken, workaround }) => {
            it(`wslc still lacks the ${description} command`, async function () {
                const { stderr } = await runWslc(args);
                expect(stderr).to.contain(`Unrecognized command: '${unrecognizedToken}'`,
                    `wslc now recognizes ${description}; add real support and remove the workaround (${workaround}).`);
            });
        });
    });

    // `run` flags wslc doesn't support. WslcClient.getRunContainerCommandArgs throws for these; they
    // are absent from `wslc run --help` today, so their appearance means it's time to emit them.
    describe('unsupported `run` flags', function () {
        const unsupportedRunFlags = ['--expose', '--add-host', '--platform'];

        unsupportedRunFlags.forEach((flag) => {
            it(`\`wslc run\` still lacks ${flag}`, async function () {
                const { stdout } = await runWslc('run --help');
                expect(stdout).to.not.contain(flag,
                    `wslc run now supports ${flag}; emit it in WslcClient.getRunContainerCommandArgs and drop the CommandNotSupportedError guard.`);
            });
        });
    });

    // NOTE: there is deliberately no canary for `--filter` on `network list` / `volume list`.
    // wslc 2.9.8+ added it, but {@link WslcClient} still filters those lists client-side
    // (matchesLabelFilters) so that the extension keeps working against wslc 2.9.3/2.9.4, which
    // reject the unknown argument outright. Server-side filtering can only be adopted once the
    // client gains version detection, so a canary here would be permanently red.
});
