/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    type CommandLineArgs,
    composeArgs,
    toArray,
    withArg,
    withFlagArg,
    withNamedArg,
    withQuotedArg,
    withVerbatimArg,
} from '@microsoft/vscode-processutils';
import type { GeneratorCommandResponse, PromiseCommandResponse } from '../../contracts/CommandRunner';
import type {
    BuildImageCommandOptions,
    CheckInstallCommandOptions,
    ContainersStatsCommandOptions,
    CreateNetworkCommandOptions,
    CreateVolumeCommandOptions,
    EventItem,
    EventStreamCommandOptions,
    ExecContainerCommandOptions,
    InfoCommandOptions,
    InfoItem,
    InspectContainersCommandOptions,
    InspectContainersItem,
    InspectImagesCommandOptions,
    InspectImagesItem,
    InspectNetworksCommandOptions,
    InspectNetworksItem,
    InspectVolumesCommandOptions,
    InspectVolumesItem,
    ListContainersCommandOptions,
    ListContainersItem,
    ListImagesCommandOptions,
    ListImagesItem,
    ListNetworkItem,
    ListNetworksCommandOptions,
    ListVolumeItem,
    ListVolumesCommandOptions,
    LoginCommandOptions,
    LogoutCommandOptions,
    LogsForContainerCommandOptions,
    PruneContainersCommandOptions,
    PruneContainersItem,
    PruneImagesCommandOptions,
    PruneImagesItem,
    PruneNetworksCommandOptions,
    PruneNetworksItem,
    PruneVolumesCommandOptions,
    PruneVolumesItem,
    PullImageCommandOptions,
    RemoveContainersCommandOptions,
    RemoveNetworksCommandOptions,
    RemoveVolumesCommandOptions,
    RestartContainersCommandOptions,
    RunContainerCommandOptions,
    StartContainersCommandOptions,
    StopContainersCommandOptions,
    VersionCommandOptions,
    VersionItem,
} from '../../contracts/ContainerClient';
import type { IContainersClient } from '../../contracts/ContainerClient';
import { CommandNotSupportedError } from '../../utils/CommandNotSupportedError';
import { DockerClientBase } from '../DockerClientBase/DockerClientBase';
import { filterByLabelsAndDriver } from '../DockerClientBase/filterByLabelsAndDriver';
import { matchesLabelFilters } from '../DockerClientBase/matchesLabelFilters';
import { parsePruneLikeOutput } from '../DockerClientBase/parsePruneLikeOutput';
import { tryParseSize } from '../DockerClientBase/tryParseSize';
import { withDockerBuildArg } from '../DockerClientBase/withDockerBuildArg';
import { withDockerEnvArg } from '../DockerClientBase/withDockerEnvArg';
import { withDockerLabelsArg } from '../DockerClientBase/withDockerLabelsArg';
import { withDockerMountsArg } from '../DockerClientBase/withDockerMountsArg';
import { withDockerPlatformArg } from '../DockerClientBase/withDockerPlatformArg';
import { withDockerPortsArg } from '../DockerClientBase/withDockerPortsArg';
import { AppleContainerInspectContainerRecordSchema, normalizeAppleContainerInspectContainerRecord } from './AppleContainerInspectContainerRecord';
import { AppleContainerInspectImageRecordSchema, normalizeAppleContainerInspectImageRecord } from './AppleContainerInspectImageRecord';
import { AppleContainerListContainerRecordSchema, normalizeAppleContainerListContainerRecord, type AppleContainerListContainerRecord } from './AppleContainerListContainerRecord';
import { AppleContainerListImageRecordSchema, normalizeAppleContainerListImageRecord } from './AppleContainerListImageRecord';
import { AppleContainerListNetworkRecordSchema, normalizeAppleContainerListNetworkRecord, normalizeAppleContainerInspectNetworkRecord } from './AppleContainerListNetworkRecord';
import { AppleContainerListVolumeRecordSchema, normalizeAppleContainerListVolumeRecord, normalizeAppleContainerInspectVolumeRecord } from './AppleContainerListVolumeRecord';

/**
 * `container prune`/`image prune`/`volume prune`/`network prune` all report a
 * `Reclaimed X in disk space` summary line (not Docker's `Total reclaimed space:`); `volume
 * prune` and `network prune` omit it entirely for volumes (no size line at all) and include it
 * for networks... -- see the per-command overrides below for the exact shape of each, since no
 * two of the four are identical.
 */
const AppleContainerReclaimedSpaceRegex = /^Reclaimed\s+([\d.]+\s*[KMGT]?B)\s+in disk space$/im;

function parseAppleContainerReclaimedSpace(output: string): number | undefined {
    const match = AppleContainerReclaimedSpaceRegex.exec(output);
    return match ? tryParseSize(match[1]) : undefined;
}

// Bare resource names/IDs, one per line -- used for `container prune`'s deleted-container list.
// Docker's default `parsePruneLikeOutput` resource regex (`^(\w+)$`) doesn't allow the hyphens
// container names commonly have (e.g. `poc-mount-test2`), so this client needs its own.
const AppleContainerPruneResourceRegex = /^([\w.-]+)$/gm;

// `image prune` reports each deleted image as `deleted <digest>` (lowercase, space-separated,
// no `sha256:` prefix) -- confirmed against real output, distinct from Docker's `deleted:
// sha256:<digest>`.
const AppleContainerPruneDeletedImageRegex = /^deleted\s+(\S+)$/img;

/**
 * {@link AppleContainerClient} implements {@link IContainersClient} for Apple's `container`
 * CLI (macOS 26+, Apple Silicon only -- see https://github.com/apple/container). It extends
 * {@link DockerClientBase} for its output-parsing helpers, but its command surface is not
 * Docker-CLI-compatible enough to inherit much else -- most command-building methods are
 * overridden. All behavior below was verified against real CLI 1.2.0 output.
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

    //#region Auth Commands

    // There is no top-level `login`/`logout` -- confirmed: `container help login` errors with
    // "unknown command 'login'". The real path is `container registry login`/`registry
    // logout`, which otherwise matches the base's Docker-shaped args (`--username`,
    // `--password-stdin`, a trailing registry argument).
    protected override getLoginCommandArgs(options: LoginCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('registry', 'login'),
            withNamedArg('--username', options.username),
            withArg('--password-stdin'),
            withArg(options.registry),
        )();
    }

    protected override getLogoutCommandArgs(options: LogoutCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('registry', 'logout'),
            withArg(options.registry),
        )();
    }

    //#endregion

    //#region Image Commands

    // The base builds `image build` (Docker's `docker image build`), but `build` is a
    // top-level verb here, not an `image` subcommand -- confirmed: `container image build`
    // routes to the `image` help instead of building, and a real `container build --tag x .`
    // succeeds. `--iidfile` and `--disable-content-trust` are dropped since neither flag
    // exists on `container build` (confirmed via --help); everything else maps over as-is.
    protected override getBuildImageCommandArgs(options: BuildImageCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('build'),
            withFlagArg('--pull', options.pull),
            withNamedArg('--file', options.file),
            withNamedArg('--target', options.stage),
            withNamedArg('--tag', options.tags),
            withDockerLabelsArg(options.labels),
            withDockerPlatformArg(options.platform),
            withDockerBuildArg(options.args),
            withVerbatimArg(options.customOptions),
            withQuotedArg(options.path),
        )();
    }

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

    // No --format flag exists for `image inspect` (confirmed: errors with "Unknown option
    // '--format'"); JSON is the only output it produces.
    protected override getInspectImagesCommandArgs(options: InspectImagesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'inspect'),
            withArg(...options.imageRefs),
        )();
    }

    protected override parseInspectImagesCommandOutput(
        options: InspectImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectImagesItem>> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeAppleContainerInspectImageRecord(AppleContainerInspectImageRecordSchema.parse(item), JSON.stringify(item)));
    }

    // `image prune` accepts `--all` but not `--force` (confirmed: errors with "Unknown option
    // '--force'"), unlike the base which always passes `--force`. Real output: a "Reclaimed X
    // in disk space" summary line, then one `deleted <digest>` line per removed image.
    protected override getPruneImagesCommandArgs(options: PruneImagesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'prune'),
            withFlagArg('--all', options.all),
        )();
    }

    protected override parsePruneImagesCommandOutput(
        options: PruneImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneImagesItem> {
        return Promise.resolve({
            imageRefsDeleted: parsePruneLikeOutput(output, { resourceRegex: AppleContainerPruneDeletedImageRegex }).resources,
            spaceReclaimed: parseAppleContainerReclaimedSpace(output),
        });
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
            withDockerMountsArg(options.mounts),
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

    // Bare `exec` (not `container exec`). Otherwise identical to the Docker-shaped default --
    // -i/--interactive, -d/--detach, -t/--tty, -e/--env all match.
    protected override getExecContainerCommandArgs(options: ExecContainerCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('exec'),
            withFlagArg('--interactive', options.interactive),
            withFlagArg('--detach', options.detached),
            withFlagArg('--tty', options.tty),
            withDockerEnvArg(options.environmentVariables),
            withArg(options.container),
            typeof options.command === 'string' ? withVerbatimArg(options.command) : withArg(...toArray(options.command)),
        )();
    }

    // Bare `logs` (not `container logs`). `-n <count>` is the tail flag (not `--tail`), and
    // there is no `--timestamps`/`--since`/`--until` support at all.
    protected override getLogsForContainerCommandArgs(options: LogsForContainerCommandOptions): CommandLineArgs {
        if (options.timestamps) {
            throw new CommandNotSupportedError('container logs does not support timestamps.');
        }
        if (options.since) {
            throw new CommandNotSupportedError('container logs does not support --since.');
        }
        if (options.until) {
            throw new CommandNotSupportedError('container logs does not support --until.');
        }

        return composeArgs(
            withArg('logs'),
            withFlagArg('--follow', options.follow),
            withNamedArg('-n', options.tail?.toString()),
            withArg(options.container),
        )();
    }

    // `container start` accepts exactly one positional container ID -- confirmed: a second ID
    // errors with "Unexpected argument '<id>'" and *neither* container ends up started. The
    // "Start" tree command can multi-select several stopped containers into one
    // `startContainers({ container: [...] })` call, but a single command invocation here can't
    // fan out to N separate CLI calls, so reject a multi-container request outright rather than
    // silently starting only the first (or none).
    protected override getStartContainersCommandArgs(options: StartContainersCommandOptions): CommandLineArgs {
        if (options.container.length > 1) {
            throw new CommandNotSupportedError('container start only supports starting one container at a time.');
        }

        return composeArgs(
            withArg('start'),
            withArg(...options.container),
        )();
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
        const results = new Array<ListContainersItem>();

        for (const raw of this.parseJsonArrayOrLines(output, strict)) {
            try {
                const record = AppleContainerListContainerRecordSchema.parse(raw);
                const item = normalizeAppleContainerListContainerRecord(record);
                if (this.matchesListContainersOptions(record, item, options)) {
                    results.push(item);
                }
            } catch (err) {
                if (strict) {
                    throw err;
                }
            }
        }

        return Promise.resolve(results);
    }

    // `networks` is matched against the already-normalized `item.networks`. `imageAncestors`/
    // `volumes` need the raw record instead -- ListContainersItem carries neither an image
    // digest/reference nor per-mount volume names -- so both the raw record and the normalized
    // item are threaded through here (confirmed available: `configuration.image.{reference,
    // descriptor.digest}` and `configuration.mounts[].type.volume.name`).
    private matchesListContainersOptions(record: AppleContainerListContainerRecord, item: ListContainersItem, options: ListContainersCommandOptions): boolean {
        if (options.running && item.state !== 'running') {
            return false;
        }
        if (options.exited && item.state !== 'exited') {
            return false;
        }
        if (options.names && options.names.length > 0 && !options.names.includes(item.name)) {
            return false;
        }
        if (!matchesLabelFilters(item.labels, options.labels)) {
            return false;
        }
        if (options.networks && options.networks.length > 0 && !options.networks.some((network) => item.networks.includes(network))) {
            return false;
        }
        if (options.imageAncestors && options.imageAncestors.length > 0) {
            // `ListImagesItem.id` for this runtime is the `name:tag` reference, not a digest
            // (see AppleContainerListImageRecord.ts), and that's what callers like
            // ImageTreeItem pass as `imageAncestors` -- so match the reference primarily, with
            // the manifest digest as a fallback in case a caller ever passes one instead.
            const reference = record.configuration.image.reference;
            const digest = record.configuration.image.descriptor?.digest;
            if (!options.imageAncestors.some((ancestor) => ancestor === reference || ancestor === digest)) {
                return false;
            }
        }
        if (options.volumes && options.volumes.length > 0) {
            const volumeNames = new Set(
                (record.configuration.mounts ?? [])
                    .map((mount) => mount.type?.volume?.name)
                    .filter((name): name is string => !!name));
            if (!options.volumes.some((volume) => volumeNames.has(volume))) {
                return false;
            }
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

    // The base builds `container prune` for this (Docker's noun-prefixed `docker container
    // prune`), which becomes `container container prune` here since the binary itself is
    // already the container noun -- confirmed to error. The real verb is bare `prune`, and it
    // accepts no `--force` at all (confirmed: errors with "Unknown option '--force'"). Real
    // output: a "Reclaimed X in disk space" summary line, then one deleted-container name per
    // line.
    protected override getPruneContainersCommandArgs(options: PruneContainersCommandOptions): CommandLineArgs {
        return composeArgs(withArg('prune'))();
    }

    protected override parsePruneContainersCommandOutput(
        options: PruneContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneContainersItem> {
        return Promise.resolve({
            containersDeleted: parsePruneLikeOutput(output, { resourceRegex: AppleContainerPruneResourceRegex }).resources,
            spaceReclaimed: parseAppleContainerReclaimedSpace(output),
        });
    }

    // The base builds `container stats` (Docker's `docker container stats`), which becomes
    // `container container stats` here since the binary itself is already the container noun
    // -- confirmed to error with "Plugin 'container-container' not found". The real verb is
    // bare `stats`, and it accepts no `--all` at all (confirmed via --help and a real
    // "Unknown option '--all'" error); it shows all running containers by default.
    protected override getStatsContainersCommandArgs(options: ContainersStatsCommandOptions): CommandLineArgs {
        return composeArgs(withArg('stats'))();
    }

    // Bare `inspect` (not `container inspect`), and no --format flag exists (confirmed: errors
    // with "Unknown option '--format'"); JSON is the only output it produces.
    protected override getInspectContainersCommandArgs(options: InspectContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('inspect'),
            withArg(...options.containers),
        )();
    }

    protected override parseInspectContainersCommandOutput(
        options: InspectContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectContainersItem>> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeAppleContainerInspectContainerRecord(AppleContainerInspectContainerRecordSchema.parse(item), JSON.stringify(item)));
    }

    //#endregion

    //#region Volume Commands

    // `volume create` has no `--driver` flag at all (confirmed via --help: only --label,
    // --opt, -s exist); reject rather than silently dropping a driver the caller explicitly
    // asked for.
    protected override getCreateVolumeCommandArgs(options: CreateVolumeCommandOptions): CommandLineArgs {
        if (options.driver) {
            throw new CommandNotSupportedError('container volume create does not support a driver.');
        }

        return composeArgs(
            withArg('volume', 'create'),
            withArg(options.name),
        )();
    }

    // No --filter flag exists for `volume list` (confirmed via --help); `dangling` has no
    // equivalent in the captured output (no container-attachment info is present) and is left
    // unfiltered, while `driver`/`labels` are applied client-side.
    protected override getListVolumesCommandArgs(options: ListVolumesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'list'),
            withNamedArg('--format', this.defaultFormatForJson),
        )();
    }

    protected override parseListVolumesCommandOutput(
        options: ListVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<ListVolumeItem>> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeAppleContainerListVolumeRecord(AppleContainerListVolumeRecordSchema.parse(item)))
            .then((items) => filterByLabelsAndDriver(items, options));
    }

    // `volume delete` (not `rm`) accepts no `--force` (confirmed via --help).
    protected override getRemoveVolumesCommandArgs(options: RemoveVolumesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'delete'),
            withArg(...options.volumes),
        )();
    }

    // `volume prune` accepts no options at all (confirmed via --help: no --force, no
    // --filter). Real output is just a "Reclaimed X in disk space" summary line -- unlike
    // container/image prune, there's no per-volume deleted-name list at all.
    protected override getPruneVolumesCommandArgs(options: PruneVolumesCommandOptions): CommandLineArgs {
        return composeArgs(withArg('volume', 'prune'))();
    }

    protected override parsePruneVolumesCommandOutput(
        options: PruneVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneVolumesItem> {
        return Promise.resolve({
            spaceReclaimed: parseAppleContainerReclaimedSpace(output),
        });
    }

    // Bare `volume inspect` (no --format flag at all -- confirmed via --help; only JSON is
    // produced), and its output shares the exact shape `volume list` uses.
    protected override getInspectVolumesCommandArgs(options: InspectVolumesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'inspect'),
            withArg(...options.volumes),
        )();
    }

    protected override parseInspectVolumesCommandOutput(
        options: InspectVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectVolumesItem>> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeAppleContainerInspectVolumeRecord(AppleContainerListVolumeRecordSchema.parse(item), JSON.stringify(item)));
    }

    //#endregion

    //#region Network Commands

    // `network create` has no `--driver` flag; `--plugin` is the closest equivalent
    // (confirmed via --help) -- it selects the network backend rather than acting as a
    // Docker-style driver name, but it's the only knob `options.driver` can map onto.
    protected override getCreateNetworkCommandArgs(options: CreateNetworkCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('network', 'create'),
            withNamedArg('--plugin', options.driver),
            withArg(options.name),
        )();
    }

    // No --filter flag exists for `network list` (confirmed via --help); `driver`/`labels`
    // are applied client-side.
    protected override getListNetworksCommandArgs(options: ListNetworksCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('network', 'list'),
            withNamedArg('--format', this.defaultFormatForJson),
        )();
    }

    protected override parseListNetworksCommandOutput(
        options: ListNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<ListNetworkItem>> {
        // Unlike wslc, `network list` emits a JSON array sharing `network inspect`'s nested
        // shape, not per-line Docker-style objects.
        return this.parseInspectJson(output, strict, (item) =>
            normalizeAppleContainerListNetworkRecord(AppleContainerListNetworkRecordSchema.parse(item)))
            .then((items) => filterByLabelsAndDriver(items, options));
    }

    // `network delete` (not `remove`) accepts no `--force` (confirmed via --help).
    protected override getRemoveNetworksCommandArgs(options: RemoveNetworksCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('network', 'delete'),
            withArg(...options.networks),
        )();
    }

    // `network prune` accepts no options at all (confirmed via --help). Unlike container/
    // image/volume prune, its output has no "Reclaimed X in disk space" summary line at all --
    // just one deleted-network name per line (confirmed against real output).
    protected override getPruneNetworksCommandArgs(options: PruneNetworksCommandOptions): CommandLineArgs {
        return composeArgs(withArg('network', 'prune'))();
    }

    protected override parsePruneNetworksCommandOutput(
        options: PruneNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneNetworksItem> {
        return Promise.resolve({
            networksDeleted: parsePruneLikeOutput(output, { resourceRegex: AppleContainerPruneResourceRegex }).resources,
        });
    }

    // Bare `network inspect` (no --format flag at all -- confirmed via --help; only JSON is
    // produced), and its output shares the exact shape `network list` uses.
    protected override getInspectNetworksCommandArgs(options: InspectNetworksCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('network', 'inspect'),
            withArg(...options.networks),
        )();
    }

    protected override parseInspectNetworksCommandOutput(
        options: InspectNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectNetworksItem>> {
        return this.parseInspectJson(output, strict, (item) =>
            normalizeAppleContainerInspectNetworkRecord(AppleContainerListNetworkRecordSchema.parse(item), JSON.stringify(item)));
    }

    //#endregion
}
