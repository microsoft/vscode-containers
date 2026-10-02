/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { exec } from 'child_process';
import { describe, it } from 'mocha';
import { promisify } from 'util';
import { AppleContainerClient } from '../../../clients/AppleContainerClient/AppleContainerClient';

const execAsync = promisify(exec);

// `container` has no dedicated `ClientType` entry (see e2eShared.ts) since this client's E2E
// suite wiring is intentionally deferred (network/volume/exec/restart/build surface needed by
// ContainersClientE2E.test.ts's shared `before` hook goes beyond what's implemented so far).
// This canary suite is lighter-weight than that -- it only probes the real CLI's `--help` text
// for the handful of gaps AppleContainerClient works around -- so it's gated on the same
// CONTAINER_CLIENT_TYPE env var directly, without needing that wiring.
const clientTypeToTest = process.env.CONTAINER_CLIENT_TYPE || 'docker';

// Invoke container by its default command name so the canaries follow the client if that ever changes.
const containerCommand = new AppleContainerClient().commandName;

interface AppleContainerCliResult {
    stdout: string;
    stderr: string;
}

/**
 * Runs `container <args>` and returns its stdout/stderr. Some failure modes (e.g. an unknown
 * subcommand) exit non-zero, so `exec`'s thrown error is unwrapped to still expose the captured
 * streams to the assertions.
 */
async function runAppleContainer(args: string): Promise<AppleContainerCliResult> {
    try {
        return await execAsync(`${containerCommand} ${args}`);
    } catch (err) {
        const e = err as { stdout?: string; stderr?: string };
        return { stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
}

/**
 * "Canary" tests that pass while the real `container` CLI LACKS a capability the
 * {@link AppleContainerClient} currently works around, and FAIL once a future CLI release adds
 * it -- signaling that the corresponding override or guard in {@link AppleContainerClient}
 * should be replaced with real support. Every assertion probes the real `container` CLI, so
 * this suite only runs against the AppleContainer integration matrix and is skipped for all
 * other runtimes. All assertions below were confirmed against real CLI 1.2.0.
 */
describe('(integration) AppleContainerCanary', function () {
    this.timeout(20000);

    before(function () {
        if (clientTypeToTest !== 'applecontainer') {
            this.skip();
        }
    });

    // Top-level subcommands the CLI doesn't implement. `container help <name>` reports
    // "unknown command '<name>'" on stderr for these; when the CLI implements one, that message
    // disappears and the matching canary fails. (Unlike `container <name> --help`, which for a
    // plugin-routed subcommand fails with a *different*, always-present "Plugin ... not found"
    // message regardless of whether the subcommand itself is real -- `help` is the only form
    // that actually distinguishes "doesn't exist" from "exists but has no separate --help".)
    describe('unsupported subcommands', function () {
        const cases: Array<{ description: string; args: string; unrecognizedToken: string; workaround: string }> = [
            { description: '`events`', args: 'help events', unrecognizedToken: 'events', workaround: 'AppleContainerClient.getEventStream rejects with CommandNotSupportedError' },
            { description: '`restart`', args: 'help restart', unrecognizedToken: 'restart', workaround: 'AppleContainerClient.restartContainers rejects with CommandNotSupportedError' },
            { description: '`info`', args: 'help info', unrecognizedToken: 'info', workaround: 'AppleContainerClient.getInfoCommandArgs/parseInfoCommandOutput synthesize a linux InfoItem' },
            { description: '`login`', args: 'help login', unrecognizedToken: 'login', workaround: 'AppleContainerClient routes through `registry login`/`registry logout` instead of a top-level login/logout' },
        ];

        cases.forEach(({ description, args, unrecognizedToken, workaround }) => {
            it(`container still lacks the ${description} command`, async function () {
                const { stderr } = await runAppleContainer(args);
                expect(stderr).to.contain(`unknown command '${unrecognizedToken}'`,
                    `container now recognizes ${description}; add real support and remove the workaround (${workaround}).`);
            });
        });
    });

    // `run` flags AppleContainerClient rejects outright. They're absent from `container run
    // --help` today; their appearance means it's time to emit them instead of throwing.
    describe('unsupported `run` flags', function () {
        const unsupportedRunFlags = ['--add-host', '--expose', '--publish-all', '--network-alias'];

        unsupportedRunFlags.forEach((flag) => {
            it(`\`container run\` still lacks ${flag}`, async function () {
                const { stdout } = await runAppleContainer('run --help');
                expect(stdout).to.not.contain(flag,
                    `container run now supports ${flag}; emit it in AppleContainerClient.getRunContainerCommandArgs and drop the CommandNotSupportedError guard.`);
            });
        });
    });

    // `logs` flags AppleContainerClient rejects outright (no --timestamps/--since/--until at
    // all -- confirmed via --help, which only lists --boot/--follow/-n).
    describe('unsupported `logs` flags', function () {
        const unsupportedLogsFlags = ['--timestamps', '--since', '--until'];

        unsupportedLogsFlags.forEach((flag) => {
            it(`\`container logs\` still lacks ${flag}`, async function () {
                const { stdout } = await runAppleContainer('logs --help');
                expect(stdout).to.not.contain(flag,
                    `container logs now supports ${flag}; emit it in AppleContainerClient.getLogsForContainerCommandArgs and drop the CommandNotSupportedError guard.`);
            });
        });
    });

    // `start` accepts exactly one positional container ID today (a second one errors with
    // "Unexpected argument"). AppleContainerClient rejects a multi-container start request
    // outright rather than guessing how to fan it out; if the CLI ever accepts multiple IDs,
    // that guard (and this canary) should be replaced with a real multi-ID invocation.
    it('`container start` still rejects a second positional container ID', async function () {
        const { stderr } = await runAppleContainer('start canary-nonexistent-1 canary-nonexistent-2');
        expect(stderr).to.contain(`Unexpected argument 'canary-nonexistent-2'`,
            'container start now accepts more than one container ID; replace the CommandNotSupportedError guard in AppleContainerClient.getStartContainersCommandArgs with a real multi-ID invocation.');
    });

    // List verbs that lack `--filter`. AppleContainerClient filters these client-side because
    // the CLI can't; when a `--filter` flag appears, push the filtering server-side instead.
    describe('list `--filter` support', function () {
        const listVerbs: Array<{ label: string; args: string }> = [
            { label: 'list', args: 'list --help' },
            { label: 'image list', args: 'image list --help' },
            { label: 'volume list', args: 'volume list --help' },
            { label: 'network list', args: 'network list --help' },
        ];

        listVerbs.forEach(({ label, args }) => {
            it(`\`container ${label}\` still lacks --filter`, async function () {
                const { stdout } = await runAppleContainer(args);
                expect(stdout).to.not.contain('--filter',
                    `container ${label} now supports --filter; push filtering server-side in AppleContainerClient instead of client-side matching.`);
            });
        });
    });

    // `--force` support for the four prune verbs and the two volume/network delete verbs.
    // AppleContainerClient drops `--force` for all of these (confirmed unsupported); when the
    // CLI adds it, thread it through from the corresponding CommandOptions.force instead of
    // silently dropping it.
    describe('`--force` support', function () {
        const cases: Array<{ label: string; args: string }> = [
            { label: 'prune', args: 'prune --help' },
            { label: 'image prune', args: 'image prune --help' },
            { label: 'volume prune', args: 'volume prune --help' },
            { label: 'network prune', args: 'network prune --help' },
            { label: 'volume delete', args: 'volume delete --help' },
            { label: 'network delete', args: 'network delete --help' },
        ];

        cases.forEach(({ label, args }) => {
            it(`\`container ${label}\` still lacks --force`, async function () {
                const { stdout } = await runAppleContainer(args);
                expect(stdout).to.not.contain('--force',
                    `container ${label} now supports --force; thread it through from CommandOptions.force in AppleContainerClient instead of always omitting it.`);
            });
        });
    });

    // `volume create` flags AppleContainerClient rejects outright (no --driver at all --
    // confirmed via --help, which only lists --label/--opt/-s).
    it('`container volume create` still lacks --driver', async function () {
        const { stdout } = await runAppleContainer('volume create --help');
        expect(stdout).to.not.contain('--driver',
            'container volume create now supports --driver; emit it in AppleContainerClient.getCreateVolumeCommandArgs and drop the CommandNotSupportedError guard.');
    });
});
