/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    type CommandLineArgs,
    composeArgs,
    withArg,
    withFlagArg,
    withNamedArg,
    withVerbatimArg,
} from '@microsoft/vscode-processutils';
import type { GeneratorCommandResponse, PromiseCommandResponse } from '../../contracts/CommandRunner';
import type {
    CheckInstallCommandOptions,
    EventItem,
    EventStreamCommandOptions,
    InfoCommandOptions,
    InfoItem,
    ListContainersCommandOptions,
    ListContainersItem,
    ListImagesCommandOptions,
    ListImagesItem,
    PullImageCommandOptions,
    RemoveContainersCommandOptions,
    RestartContainersCommandOptions,
    RunContainerCommandOptions,
    StopContainersCommandOptions,
    VersionCommandOptions,
    VersionItem,
} from '../../contracts/ContainerClient';
import type { IContainersClient } from '../../contracts/ContainerClient';
import { CommandNotSupportedError } from '../../utils/CommandNotSupportedError';
import { DockerClientBase } from '../DockerClientBase/DockerClientBase';
import { withDockerEnvArg } from '../DockerClientBase/withDockerEnvArg';
import { withDockerLabelsArg } from '../DockerClientBase/withDockerLabelsArg';
import { withDockerPlatformArg } from '../DockerClientBase/withDockerPlatformArg';
import { withDockerPortsArg } from '../DockerClientBase/withDockerPortsArg';
import { matchesLabelFilters } from '../DockerClientBase/matchesLabelFilters';
import { AppleContainerListContainerRecordSchema, normalizeAppleContainerListContainerRecord } from './AppleContainerListContainerRecord';
import { AppleContainerListImageRecordSchema, normalizeAppleContainerListImageRecord } from './AppleContainerListImageRecord';

/**
 * {@link AppleContainerClient} implements {@link IContainersClient} for Apple's `container`
 * CLI (macOS 26+, Apple Silicon only -- see https://github.com/apple/container). It extends
 * {@link DockerClientBase} for its output-parsing helpers, but its command surface is not
 * Docker-CLI-compatible enough to inherit much else -- most command-building methods are
 * overridden. All behavior below was verified against real CLI 1.2.0 output; see
 * `apple-container-poc-plan.md` at the repo root for the raw captures.
 *
 * Key differences vs. Docker:
 * - The binary itself is the container noun -- container-object verbs are top-level
 *   (`container run`, `container list`, `container stop`, `container delete`), not
 *   `docker container run`-style. Image verbs do nest under `image`, matching Docker.
 * - `list` / `image list` accept no `--filter` flag at all (stricter than even `wslc`); all
 *   filtering in {@link ListContainersCommandOptions} is applied client-side.
 * - `--format json` is a literal token, not a Go template.
 * - `image pull` fetches every platform in a multi-arch manifest by default; pinned to
 *   `--arch arm64` here since this client only ever runs on Apple Silicon.
 * - No `events`, `restart`, or `info` subcommand exists.
 * - `--version`/`-v` only accepts the long form; the short form errors.
 */
export class AppleContainerClient extends DockerClientBase implements IContainersClient {
    /**
     * The ID of the AppleContainer client
     */
    public static ClientId = 'com.microsoft.visualstudio.containers.applecontainer';

    /**
     * `container ... --format` accepts the literal tokens `json`/`table`/`yaml`/`toml`, not a
     * Go template.
     */
    protected override readonly defaultFormatForJson: string = 'json';

    /**
     * Constructs a new {@link AppleContainerClient}
     */
    public constructor(
        commandName: string = 'container',
        displayName: string = 'Container',
        description: string = 'Runs container commands using the Apple container CLI (macOS, Apple Silicon only)'
    ) {
        super(
            AppleContainerClient.ClientId,
            commandName,
            displayName,
            description
        );
    }

    //#region Information Commands

    // There is no `container info` subcommand. This client only ever runs on Apple Silicon
    // Macs running Linux containers, so synthesize a minimal record rather than shelling out
    // further (mirrors WslcClient, which has the same gap). `--version` is the cheapest command
    // that proves the CLI is present; its output is not used.
    protected override getInfoCommandArgs(options: InfoCommandOptions): CommandLineArgs {
        return composeArgs(withArg('--version'))();
    }

    protected override parseInfoCommandOutput(output: string, strict: boolean): Promise<InfoItem> {
        return Promise.resolve({
            operatingSystem: undefined,
            osType: 'linux',
            raw: output,
        });
    }

    // There is no top-level `version` subcommand -- only the daemon-dependent, plugin-backed
    // `system version` (which, like all plugin subcommands, fails outright if system services
    // aren't running, even just to print its own --help). The `--version` flag works
    // unconditionally, so it's reused for both `version` and `checkInstall`.
    protected override getVersionCommandArgs(options: VersionCommandOptions): CommandLineArgs {
        return composeArgs(withArg('--version'))();
    }

    // Real output: "container CLI version 1.2.0 (build: release, commit: 6e65319)"
    protected override parseVersionCommandOutput(output: string, strict: boolean): Promise<VersionItem> {
        const match = /version\s+(\d+(?:\.\d+)+)/i.exec(output);
        if (!match && strict) {
            throw new Error(`Unable to parse container version output: ${output}`);
        }

        return Promise.resolve({
            client: match?.[1] ?? '',
            server: undefined,
        });
    }

    // Confirmed: `container -v` errors ("unknown option '-v'"); only the long flag works.
    protected override getCheckInstallCommandArgs(options: CheckInstallCommandOptions): CommandLineArgs {
        return composeArgs(withArg('--version'))();
    }

    // There is no `events` subcommand.
    public override getEventStream(options: EventStreamCommandOptions): Promise<GeneratorCommandResponse<EventItem>> {
        return Promise.reject(new CommandNotSupportedError('container does not support the events command.'));
    }

    //#endregion

    //#region Image Commands

    protected override getPullImageCommandArgs(options: PullImageCommandOptions): CommandLineArgs {
        if (options.allTags) {
            throw new CommandNotSupportedError('container image pull does not support pulling all tags at once.');
        }
        if (options.disableContentTrust !== undefined) {
            throw new CommandNotSupportedError('container image pull does not support content trust settings.');
        }

        return composeArgs(
            withArg('image', 'pull'),
            // Without an explicit --arch, `image pull` fetches every platform in a multi-arch
            // manifest (confirmed: 8 platforms fetched for one `alpine:latest` pull). This
            // client only ever runs on Apple Silicon, so pin to arm64.
            withNamedArg('--arch', 'arm64'),
            withArg(options.imageRef),
        )();
    }

    protected override getListImagesCommandArgs(options: ListImagesCommandOptions): CommandLineArgs {
        // No --all, --filter, or --label-filter flags exist for `image list`; every option in
        // ListImagesCommandOptions is applied client-side in parseListImagesCommandOutput.
        return composeArgs(
            withArg('image', 'list'),
            withNamedArg('--format', this.defaultFormatForJson),
        )();
    }

    protected override parseListImagesCommandOutput(
        options: ListImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<ListImagesItem>> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeAppleContainerListImageRecord(AppleContainerListImageRecordSchema.parse(item)))
            .then((items) => items.filter((item) => this.matchesListImagesOptions(item, options)));
    }

    // `dangling` and `labels` have no equivalent in the captured `image list` output (no
    // dangling concept, no per-image label surfaced at the top level) and are left
    // unfiltered -- a known limitation, not a silent bug, since nothing in the schema claims
    // to support them.
    private matchesListImagesOptions(item: ListImagesItem, options: ListImagesCommandOptions): boolean {
        if (options.references && options.references.length > 0) {
            const name = item.image.originalName;
            if (!name || !options.references.some((reference) => name === reference || name.startsWith(`${reference}:`) || name.startsWith(`${reference}@`))) {
                return false;
            }
        }

        return true;
    }

    //#endregion

    //#region Container Commands

    protected override getRunContainerCommandArgs(options: RunContainerCommandOptions): CommandLineArgs {
        if (options.publishAllPorts) {
            throw new CommandNotSupportedError('container run does not support publishing all ports.');
        }
        if (options.networkAlias) {
            throw new CommandNotSupportedError('container run does not support a network alias.');
        }
        if (options.addHost && options.addHost.length > 0) {
            throw new CommandNotSupportedError('container run does not support --add-host.');
        }
        if (options.exposePorts && options.exposePorts.length > 0) {
            throw new CommandNotSupportedError('container run does not support --expose.');
        }

        return composeArgs(
            withArg('run'),
            withFlagArg('--detach', options.detached),
            withFlagArg('--interactive', options.interactive),
            withFlagArg('--tty', options.detached || options.interactive),
            withFlagArg('--rm', options.removeOnExit),
            withNamedArg('--name', options.name),
            withDockerPortsArg(options.ports),
            withNamedArg('--network', options.network),
            this.getRunContainerMountsArg(options.mounts),
            withDockerLabelsArg(options.labels),
            withDockerEnvArg(options.environmentVariables),
            withNamedArg('--env-file', options.environmentFiles),
            withNamedArg('--entrypoint', options.entrypoint),
            withDockerPlatformArg(options.platform),
            withVerbatimArg(options.customOptions),
            withArg(options.imageRef),
            typeof options.command === 'string'
                ? withVerbatimArg(options.command)
                : withArg(...(options.command ?? [])),
        )();
    }

    // `container run --mount` uses `target=` for the in-container path, not Docker's
    // `destination=`.
    protected override getRunContainerMountsArg(mounts: RunContainerCommandOptions['mounts']) {
        return withNamedArg(
            '--mount',
            (mounts ?? []).map((mount) =>
                [`type=${mount.type}`, `source=${mount.source}`, `target=${mount.destination}`, mount.readOnly ? 'readonly' : '']
                    .filter((part) => !!part)
                    .join(',')),
        );
    }

    protected override getListContainersCommandArgs(options: ListContainersCommandOptions): CommandLineArgs {
        // No --filter flag exists for `list`. `--all` is passed whenever a filter that needs
        // to see non-running containers is requested; the default (no --all) already limits
        // results to running containers, which covers the common "list running" case for free.
        // Every other option in ListContainersCommandOptions is applied client-side below.
        return composeArgs(
            withArg('list'),
            withFlagArg('--all', options.all || options.exited),
            withNamedArg('--format', this.defaultFormatForJson),
        )();
    }

    protected override parseListContainersCommandOutput(
        options: ListContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<ListContainersItem>> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeAppleContainerListContainerRecord(AppleContainerListContainerRecordSchema.parse(item)))
            .then((items) => items.filter((item) => this.matchesListContainersOptions(item, options)));
    }

    // `imageAncestors`/`volumes`/`networks` filters have no client-side equivalent that can be
    // derived safely from `list` output (no resolved image digest or volume attachment info is
    // present) and are left unfiltered -- deferred along with the rest of the volume/network
    // command surface.
    private matchesListContainersOptions(item: ListContainersItem, options: ListContainersCommandOptions): boolean {
        if (options.running && item.state !== 'running') {
            return false;
        }
        if (options.exited && item.state !== 'stopped') {
            return false;
        }
        if (options.names && options.names.length > 0 && !options.names.includes(item.name)) {
            return false;
        }
        if (!matchesLabelFilters(item.labels, options.labels)) {
            return false;
        }

        return true;
    }

    protected override getStopContainersCommandArgs(options: StopContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('stop'),
            withNamedArg('--time', typeof options.time === 'number' ? options.time.toString() : undefined),
            withArg(...options.container),
        )();
    }

    protected override getRemoveContainersCommandArgs(options: RemoveContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('delete'),
            withFlagArg('--force', options.force),
            withArg(...options.containers),
        )();
    }

    // There is no `restart` subcommand.
    public override restartContainers(options: RestartContainersCommandOptions): Promise<PromiseCommandResponse<Array<string>>> {
        return Promise.reject(new CommandNotSupportedError('container does not support the restart command.'));
    }

    //#endregion
}
