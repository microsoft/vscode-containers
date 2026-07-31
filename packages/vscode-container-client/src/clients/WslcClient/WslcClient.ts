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
    withQuotedArg,
    withVerbatimArg,
} from '@microsoft/vscode-processutils';
import type { GeneratorCommandResponse, PromiseCommandResponse } from '../../contracts/CommandRunner';
import type {
    BuildImageCommandOptions,
    CheckInstallCommandOptions,
    CreateNetworkCommandOptions,
    EventItem,
    EventStreamCommandOptions,
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
    PortBinding,
    PruneContainersCommandOptions,
    PruneImagesCommandOptions,
    PruneNetworksCommandOptions,
    PruneNetworksItem,
    PruneVolumesCommandOptions,
    PruneVolumesItem,
    PullImageCommandOptions,
    ReadFileCommandOptions,
    RemoveContainersCommandOptions,
    RemoveImagesCommandOptions,
    RemoveNetworksCommandOptions,
    RestartContainersCommandOptions,
    RunContainerCommandOptions,
    VersionCommandOptions,
    VersionItem,
    WriteFileCommandOptions,
} from '../../contracts/ContainerClient';
import { asIds } from '../../utils/asIds';
import { CommandNotSupportedError } from '../../utils/CommandNotSupportedError';
import { dayjs } from '../../utils/dayjs';
import { parseDockerLikeImageName } from '../../utils/parseDockerLikeImageName';
import { DockerClientBase } from '../DockerClientBase/DockerClientBase';
import { matchesLabelFilters } from '../DockerClientBase/matchesLabelFilters';
import { normalizeIpAddress } from '../DockerClientBase/normalizeIpAddress';
import { parsePruneLikeOutput } from '../DockerClientBase/parsePruneLikeOutput';
import { withDockerBuildArg } from '../DockerClientBase/withDockerBuildArg';
import { withDockerEnvArg } from '../DockerClientBase/withDockerEnvArg';
import { withDockerBooleanFilterArg, withDockerFilterArg } from '../DockerClientBase/withDockerFilterArg';
import { withDockerLabelFilterArgs } from '../DockerClientBase/withDockerLabelFilterArgs';
import { withDockerLabelsArg } from '../DockerClientBase/withDockerLabelsArg';
import { withDockerPortsArg } from '../DockerClientBase/withDockerPortsArg';
import { withContainerPathArg } from '../DockerClientBase/withContainerPathArg';
import { WslcInspectContainerRecordSchema, normalizeWslcInspectContainerRecord } from './WslcInspectContainerRecord';
import { WslcInspectImageRecordSchema, normalizeWslcInspectImageRecord } from './WslcInspectImageRecord';
import { WslcInspectVolumeRecordSchema, normalizeWslcInspectVolumeRecord } from './WslcInspectVolumeRecord';
import { mapWslcContainerState, WslcListContainerRecordSchema } from './WslcListContainerRecord';
import { WslcListImageRecordSchema } from './WslcListImageRecord';
import { normalizeWslcListVolumeRecord, WslcListVolumeRecordSchema } from './WslcListVolumeRecord';
import { normalizeWslcInspectNetworkRecord, normalizeWslcListNetworkRecord, WslcNetworkRecordSchema } from './WslcNetworkRecord';

/**
 * wslc reports pruned resources as `Deleted: <name>` lines, unlike the Docker CLI
 * which prints bare names (volumes) or a `Deleted Networks:` header (networks).
 */
const WslcPruneDeletedRegex = /^Deleted:\s+(.+?)\s*$/igm;

/**
 * {@link WslcClient} implements {@link IContainersClient} for the Windows Subsystem for Linux
 * Container CLI (`wslc`). It is mostly compatible with the Docker CLI surface, so it inherits
 * from {@link DockerClientBase} and overrides only the arg builders / parsers that differ.
 *
 * Key differences vs. Docker:
 * - The CLI is only available on Windows.
 * - `--format` accepts only `json` or `table` (no Go templates).
 * - List verb is `list` for containers and `images` for images.
 * - Image removal uses `rmi`, container removal uses `remove`.
 * - `inspect` uses the top-level `inspect --type <container|image|volume|network>` form (JSON by
 *   default, no `--format`); it accepts multiple ids and exits non-zero if any are missing.
 * - There are no `info`, `events`, or `context` subcommands.
 * - File reads use `container exec tar` (wslc can't stream `cp` to stdout) and writes use
 *   `container cp` (there is no top-level `cp`). Reads require `tar` in the container image.
 */
export class WslcClient extends DockerClientBase {
    /**
     * The ID of the WSLC client.
     */
    public static ClientId = 'com.microsoft.visualstudio.containers.wslc';

    /**
     * The default `--format` argument value. `wslc` only accepts the literal
     * tokens `json` or `table`, not Go templates.
     */
    protected readonly defaultFormatForJson: string = 'json';

    public constructor(
        commandName: string = 'wslc',
        displayName: string = 'WSLC',
        description: string = 'Runs container commands using the Windows Subsystem for Linux Container CLI'
    ) {
        super(
            WslcClient.ClientId,
            commandName,
            displayName,
            description
        );
    }

    //#region Information Commands

    // wslc has no `info` subcommand. WSL containers are always Linux, so return a synthetic
    // record so callers depending on `osType` keep working without throwing.
    protected override getInfoCommandArgs(options: InfoCommandOptions): CommandLineArgs {
        return composeArgs(withArg('version'))();
    }

    protected override parseInfoCommandOutput(output: string, strict: boolean): Promise<InfoItem> {
        return Promise.resolve({
            operatingSystem: undefined,
            osType: 'linux',
            raw: output,
        });
    }

    // wslc emits plain text like `wslc <version>` and does not support `--format`.
    protected override getVersionCommandArgs(options: VersionCommandOptions): CommandLineArgs {
        return composeArgs(withArg('version'))();
    }

    protected override parseVersionCommandOutput(output: string, strict: boolean): Promise<VersionItem> {
        const match = /(\d+(?:\.\d+)+)/.exec(output);
        if (!match && strict) {
            throw new Error(`Unable to parse wslc version output: ${output}`);
        }
        const version = match?.[1] ?? '';

        return Promise.resolve({
            client: version,
            server: undefined,
        });
    }

    protected override getCheckInstallCommandArgs(options: CheckInstallCommandOptions): CommandLineArgs {
        return composeArgs(withArg('--version'))();
    }

    // wslc has no `events` subcommand.
    public override getEventStream(options: EventStreamCommandOptions): Promise<GeneratorCommandResponse<EventItem>> {
        return Promise.reject(new CommandNotSupportedError('wslc does not support the events command.'));
    }

    //#endregion

    //#region Image Commands

    protected override getBuildImageCommandArgs(options: BuildImageCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('build'),
            withFlagArg('--pull', options.pull),
            withNamedArg('--file', options.file),
            withNamedArg('--target', options.stage),
            withNamedArg('--tag', options.tags),
            withDockerLabelsArg(options.labels),
            withDockerBuildArg(options.args),
            withVerbatimArg(options.customOptions),
            withQuotedArg(options.path),
        )();
    }

    protected override getListImagesCommandArgs(options: ListImagesCommandOptions): CommandLineArgs {
        // wslc `images` has no `--all` flag, but it does support --filter (dangling / reference /
        // label, same syntax as Docker) and only `json` as a format value.
        return composeArgs(
            withArg('images'),
            withDockerBooleanFilterArg('dangling', options.dangling),
            withDockerFilterArg(options.references?.map((reference) => `reference=${reference}`)),
            withDockerLabelFilterArgs(options.labels),
            withNamedArg('--format', this.defaultFormatForJson),
        )();
    }

    protected override parseListImagesCommandOutput(
        options: ListImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<ListImagesItem>> {
        const images = new Array<ListImagesItem>();
        try {
            const parsed: unknown = JSON.parse(output);
            const rawArray: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
            for (const raw of rawArray) {
                try {
                    // Validate per-record so one malformed entry doesn't discard the whole list.
                    const rawImage = WslcListImageRecordSchema.parse(raw);
                    const repositoryAndTag = rawImage.Repository
                        ? `${rawImage.Repository}${rawImage.Tag ? `:${rawImage.Tag}` : ''}`
                        : undefined;
                    images.push({
                        id: rawImage.Id,
                        image: parseDockerLikeImageName(repositoryAndTag),
                        createdAt: dayjs.unix(rawImage.Created).toDate(),
                        size: rawImage.Size,
                    });
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }
            }
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return Promise.resolve(images);
    }

    protected override getRemoveImagesCommandArgs(options: RemoveImagesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('rmi'),
            withFlagArg('--force', options.force),
            withArg(...options.imageRefs),
        )();
    }

    // wslc `pull` only accepts the image ref; it has no --all-tags or
    // --disable-content-trust flags.
    protected override getPullImageCommandArgs(options: PullImageCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('pull'),
            withArg(options.imageRef),
        )();
    }

    // wslc `image prune` accepts `--all` but not `--force` (it never prompts).
    protected override getPruneImagesCommandArgs(options: PruneImagesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'prune'),
            withFlagArg('--all', options.all),
        )();
    }

    protected override parseRemoveImagesCommandOutput(
        options: RemoveImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<string>> {
        // wslc `rmi` prints the removed image id per line (no `deleted:` prefix).
        return Promise.resolve(asIds(output));
    }

    protected override getInspectImagesCommandArgs(options: InspectImagesCommandOptions): CommandLineArgs {
        // wslc `inspect --type image` accepts multiple ids and returns a JSON array. If any id is
        // missing it exits non-zero (the runner surfaces that as an error), so no id is silently lost.
        return composeArgs(
            withArg('inspect'),
            withNamedArg('--type', 'image'),
            withArg(...options.imageRefs),
        )();
    }

    protected override parseInspectImagesCommandOutput(
        options: InspectImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectImagesItem>> {
        const items: InspectImagesItem[] = [];
        const trimmed = output.trim();
        if (!trimmed) {
            return Promise.resolve(items);
        }
        try {
            const parsed: unknown = JSON.parse(trimmed);
            const rawArray: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
            for (const raw of rawArray) {
                try {
                    // Validate per-record so one malformed entry doesn't discard the whole result.
                    const record = WslcInspectImageRecordSchema.parse(raw);
                    items.push(normalizeWslcInspectImageRecord(record, JSON.stringify(raw)));
                } catch (err) {
                    if (strict) { throw err; }
                }
            }
        } catch (err) {
            if (strict) { throw err; }
        }
        return Promise.resolve(items);
    }

    //#endregion

    //#region Container Commands

    protected override getListContainersCommandArgs(options: ListContainersCommandOptions): CommandLineArgs {
        // wslc `list` supports --all, --filter (same keys/format as Docker), and --format json.
        // Emit the same filters the base does so consumers that rely on server-side filtering
        // (e.g. "containers using this volume/network/image") get correct results.
        return composeArgs(
            withArg('list'),
            withFlagArg('--all', options.all),
            withDockerLabelFilterArgs(options.labels),
            withDockerFilterArg(options.running ? 'status=running' : undefined),
            withDockerFilterArg(options.exited ? 'status=exited' : undefined),
            withDockerFilterArg(options.names?.map((name) => `name=${name}`)),
            withDockerFilterArg(options.imageAncestors?.map((id) => `ancestor=${id}`)),
            withDockerFilterArg(options.volumes?.map((volume) => `volume=${volume}`)),
            withDockerFilterArg(options.networks?.map((network) => `network=${network}`)),
            withNamedArg('--format', this.defaultFormatForJson),
        )();
    }

    protected override parseListContainersCommandOutput(
        options: ListContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<ListContainersItem>> {
        const containers = new Array<ListContainersItem>();
        try {
            const parsed: unknown = JSON.parse(output);
            const rawArray: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
            for (const raw of rawArray) {
                try {
                    // Validate per-record so one malformed entry doesn't discard the whole list.
                    const rawContainer = WslcListContainerRecordSchema.parse(raw);
                    const state = mapWslcContainerState(rawContainer.State);
                    const ports: PortBinding[] = (rawContainer.Ports ?? []).flatMap(p => {
                        // wslc can emit a binding without a ContainerPort; skip it rather than
                        // fabricating containerPort: 0, since containerPort is required by the contract.
                        if (p.ContainerPort === undefined) {
                            return [];
                        }
                        // Match the Docker port parser: when wslc doesn't report a bind address,
                        // omit hostIp rather than fabricating one, so an all-interfaces publish
                        // isn't mislabeled as loopback (127.0.0.1).
                        const hostIp = normalizeIpAddress(p.BindingAddress);
                        return [{
                            containerPort: p.ContainerPort,
                            ...(hostIp !== undefined ? { hostIp } : {}),
                            hostPort: p.HostPort,
                            // wslc encodes the protocol as an IANA protocol number (6 = TCP, 17 = UDP).
                            protocol: p.Protocol === 6
                                ? 'tcp'
                                : p.Protocol === 17
                                    ? 'udp'
                                    : undefined,
                        }];
                    });

                    containers.push({
                        id: rawContainer.Id,
                        name: rawContainer.Name ?? '',
                        image: parseDockerLikeImageName(rawContainer.Image),
                        labels: rawContainer.Labels ?? {},
                        createdAt: dayjs.unix(rawContainer.CreatedAt).toDate(),
                        ports,
                        networks: rawContainer.Networks ?? [],
                        state,
                        status: undefined,
                    });
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }
            }
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return Promise.resolve(containers);
    }

    protected override getRemoveContainersCommandArgs(options: RemoveContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('remove'),
            withFlagArg('--force', options.force),
            withArg(...options.containers),
        )();
    }

    /**
     * wslc does not support the Docker `--mount` flag; emit the legacy
     * `--volume src:dst[:ro]` form instead. This works for both bind mounts
     * (source is a host path) and named-volume mounts (source is a volume name).
     */
    protected override getRunContainerMountsArg(mounts: RunContainerCommandOptions['mounts']) {
        return withNamedArg(
            '--volume',
            (mounts ?? []).map(m => `${m.source}:${m.destination}${m.readOnly ? ':ro' : ''}`),
        );
    }

    // wslc `run` supports `--network-alias` but not `--add-host`, `--expose`, or `--platform`.
    // Throw if a caller sets an unsupported option so behavior is explicit rather than silently
    // dropping the value. Drop them only when unset (the common runtime-agnostic case).
    protected override getRunContainerCommandArgs(options: RunContainerCommandOptions): CommandLineArgs {
        if (options.addHost && options.addHost.length > 0) {
            throw new CommandNotSupportedError('wslc run does not support --add-host.');
        }
        if (options.exposePorts && options.exposePorts.length > 0) {
            throw new CommandNotSupportedError('wslc run does not support --expose.');
        }
        if (options.platform) {
            throw new CommandNotSupportedError('wslc run does not support --platform.');
        }
        return composeArgs(
            withArg('run'),
            withFlagArg('--detach', options.detached),
            withFlagArg('--interactive', options.interactive),
            withFlagArg('--tty', options.detached || options.interactive),
            withFlagArg('--rm', options.removeOnExit),
            withNamedArg('--name', options.name),
            withDockerPortsArg(options.ports),
            withFlagArg('--publish-all', options.publishAllPorts),
            withNamedArg('--network', options.network),
            withNamedArg('--network-alias', options.networkAlias),
            this.getRunContainerMountsArg(options.mounts),
            withDockerLabelsArg(options.labels),
            withDockerEnvArg(options.environmentVariables),
            withNamedArg('--env-file', options.environmentFiles),
            withNamedArg('--entrypoint', options.entrypoint),
            withVerbatimArg(options.customOptions),
            withArg(options.imageRef),
            typeof options.command === 'string'
                ? withVerbatimArg(options.command)
                : withArg(...(options.command ?? [])),
        )();
    }

    // wslc `container prune` does not accept --force or --filter. The contract today
    // has no filterable options to validate, so just emit the bare verb.
    protected override getPruneContainersCommandArgs(options: PruneContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'prune'),
        )();
    }

    // wslc has no `restart` subcommand. Reject rather than silently inheriting
    // a command line that wslc would reject.
    public override restartContainers(options: RestartContainersCommandOptions): Promise<PromiseCommandResponse<Array<string>>> {
        return Promise.reject(new CommandNotSupportedError('wslc does not support the restart command.'));
    }

    protected override getInspectContainersCommandArgs(options: InspectContainersCommandOptions): CommandLineArgs {
        // wslc `inspect --type container` accepts multiple ids and returns a JSON array; a missing
        // id makes it exit non-zero (surfaced as an error) rather than being silently dropped.
        return composeArgs(
            withArg('inspect'),
            withNamedArg('--type', 'container'),
            withArg(...options.containers),
        )();
    }

    protected override parseInspectContainersCommandOutput(
        options: InspectContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectContainersItem>> {
        const items: InspectContainersItem[] = [];
        const trimmed = output.trim();
        if (!trimmed) {
            return Promise.resolve(items);
        }
        try {
            const parsed: unknown = JSON.parse(trimmed);
            const rawArray: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
            for (const raw of rawArray) {
                try {
                    // Validate per-record so one malformed entry doesn't discard the whole result.
                    const record = WslcInspectContainerRecordSchema.parse(raw);
                    items.push(normalizeWslcInspectContainerRecord(record, JSON.stringify(raw)));
                } catch (err) {
                    if (strict) { throw err; }
                }
            }
        } catch (err) {
            if (strict) { throw err; }
        }
        return Promise.resolve(items);
    }

    //#endregion

    //#region Volume Commands

    protected override getListVolumesCommandArgs(options: ListVolumesCommandOptions): CommandLineArgs {
        // wslc `volume list` has no `--filter` flag, so `labels`/`driver` filters can't be pushed to
        // the CLI; they are applied client-side in parseListVolumesCommandOutput instead.
        return composeArgs(
            withArg('volume', 'list'),
            withNamedArg('--format', this.defaultFormatForJson),
        )();
    }

    protected override parseListVolumesCommandOutput(
        options: ListVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<ListVolumeItem[]> {
        const items: ListVolumeItem[] = [];
        const trimmed = output.trim();
        if (trimmed) {
            try {
                const parsed: unknown = JSON.parse(trimmed);
                const rawArray: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
                for (const raw of rawArray) {
                    try {
                        // Validate per-record so one malformed entry doesn't discard the whole list.
                        const record = WslcListVolumeRecordSchema.parse(raw);
                        const item = normalizeWslcListVolumeRecord(record);

                        // wslc can't filter server-side, so honor labels/driver here. `dangling`
                        // needs container-usage info that `volume list` doesn't provide, so it
                        // can't be evaluated client-side and is left unfiltered.
                        if (!matchesLabelFilters(item.labels, options.labels)) {
                            continue;
                        }
                        if (options.driver && item.driver !== options.driver) {
                            continue;
                        }

                        items.push(item);
                    } catch (err) {
                        if (strict) { throw err; }
                    }
                }
            } catch (err) {
                if (strict) { throw err; }
            }
        }
        return Promise.resolve(items);
    }

    protected override getInspectVolumesCommandArgs(options: InspectVolumesCommandOptions): CommandLineArgs {
        // wslc `inspect --type volume` accepts multiple names and returns a JSON array; a missing
        // name makes it exit non-zero (surfaced as an error) rather than being silently dropped.
        return composeArgs(
            withArg('inspect'),
            withNamedArg('--type', 'volume'),
            withArg(...options.volumes),
        )();
    }

    protected override parseInspectVolumesCommandOutput(
        options: InspectVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectVolumesItem>> {
        const items: InspectVolumesItem[] = [];
        const trimmed = output.trim();
        if (!trimmed) {
            return Promise.resolve(items);
        }
        try {
            const parsed: unknown = JSON.parse(trimmed);
            const rawArray: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
            for (const raw of rawArray) {
                try {
                    // Validate per-record so one malformed entry doesn't discard the whole result.
                    const record = WslcInspectVolumeRecordSchema.parse(raw);
                    items.push(normalizeWslcInspectVolumeRecord(record, JSON.stringify(raw)));
                } catch (err) {
                    if (strict) { throw err; }
                }
            }
        } catch (err) {
            if (strict) { throw err; }
        }
        return Promise.resolve(items);
    }

    // wslc `volume prune` accepts `--all` / `--filter` but not `--force`. The contract
    // exposes no options today, so emit the bare verb. Deleted names are reported as
    // `Deleted: <name>` lines (not the Docker bare-name format).
    protected override getPruneVolumesCommandArgs(options: PruneVolumesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'prune'),
        )();
    }

    protected override parsePruneVolumesCommandOutput(
        options: PruneVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneVolumesItem> {
        const pruned = parsePruneLikeOutput(output, { resourceRegex: WslcPruneDeletedRegex });
        return Promise.resolve({
            volumesDeleted: pruned.resources,
            spaceReclaimed: pruned.spaceReclaimed,
        });
    }

    //#endregion

    //#region Network Commands

    // wslc network supports create / list / remove / inspect / prune. Inspect uses the
    // top-level `inspect --type network` form (same as other object types in wslc).

    protected override getCreateNetworkCommandArgs(options: CreateNetworkCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('network', 'create'),
            withNamedArg('--driver', options.driver),
            withArg(options.name),
        )();
    }

    protected override getListNetworksCommandArgs(options: ListNetworksCommandOptions): CommandLineArgs {
        // wslc `network list` has no `--filter` flag, so `labels`/`driver` filters can't be pushed to
        // the CLI; they are applied client-side in parseListNetworksCommandOutput instead.
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
        const items: ListNetworkItem[] = [];
        const trimmed = output.trim();
        if (!trimmed) {
            return Promise.resolve(items);
        }
        try {
            const parsed: unknown = JSON.parse(trimmed);
            const rawArray: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
            for (const raw of rawArray) {
                try {
                    // Validate per-record so one malformed entry doesn't discard the whole list.
                    const record = WslcNetworkRecordSchema.parse(raw);
                    const item = normalizeWslcListNetworkRecord(record);

                    // wslc can't filter server-side, so honor labels/driver here.
                    if (!matchesLabelFilters(item.labels, options.labels)) {
                        continue;
                    }
                    if (options.driver && item.driver !== options.driver) {
                        continue;
                    }

                    items.push(item);
                } catch (err) {
                    if (strict) { throw err; }
                }
            }
        } catch (err) {
            if (strict) { throw err; }
        }
        return Promise.resolve(items);
    }

    protected override getRemoveNetworksCommandArgs(options: RemoveNetworksCommandOptions): CommandLineArgs {
        // wslc network remove takes positional names and supports --force.
        return composeArgs(
            withArg('network', 'remove'),
            withFlagArg('--force', options.force),
            withArg(...options.networks),
        )();
    }

    protected override getInspectNetworksCommandArgs(options: InspectNetworksCommandOptions): CommandLineArgs {
        // wslc `inspect --type network` accepts multiple names and returns a JSON array; a missing
        // name makes it exit non-zero (surfaced as an error) rather than being silently dropped.
        return composeArgs(
            withArg('inspect'),
            withNamedArg('--type', 'network'),
            withArg(...options.networks),
        )();
    }

    protected override parseInspectNetworksCommandOutput(
        options: InspectNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectNetworksItem>> {
        const items: InspectNetworksItem[] = [];
        const trimmed = output.trim();
        if (!trimmed) {
            return Promise.resolve(items);
        }
        try {
            const parsed: unknown = JSON.parse(trimmed);
            const rawArray: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
            for (const raw of rawArray) {
                try {
                    // Validate per-record so one malformed entry doesn't discard the whole result.
                    const record = WslcNetworkRecordSchema.parse(raw);
                    items.push(normalizeWslcInspectNetworkRecord(record, JSON.stringify(raw)));
                } catch (err) {
                    if (strict) { throw err; }
                }
            }
        } catch (err) {
            if (strict) { throw err; }
        }
        return Promise.resolve(items);
    }

    // wslc `network prune` accepts `--filter` but not `--force`. The contract exposes no
    // options today, so emit the bare verb. Deleted names are reported as `Deleted: <name>`
    // lines (not the Docker "Deleted Networks:" header format).
    protected override getPruneNetworksCommandArgs(options: PruneNetworksCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('network', 'prune'),
        )();
    }

    protected override parsePruneNetworksCommandOutput(
        options: PruneNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneNetworksItem> {
        const pruned = parsePruneLikeOutput(output, { resourceRegex: WslcPruneDeletedRegex });
        return Promise.resolve({
            networksDeleted: pruned.resources,
        });
    }

    //#endregion

    //#region File Commands

    // wslc has no top-level `cp`, and `container cp` cannot stream a container path to stdout.
    // Read the file by tarring it inside the container via `exec` so the caller can untar the
    // single-entry stream (matching the tar that Docker's `cp <path> -` produces). This requires
    // `tar` to be available in the container image. wslc only runs Linux containers.
    protected override getReadFileCommandArgs(options: ReadFileCommandOptions): CommandLineArgs {
        const containerPath = options.path.replace(/\/+$/, '');
        const lastSlash = containerPath.lastIndexOf('/');
        const directory = lastSlash <= 0 ? '/' : containerPath.slice(0, lastSlash);
        const fileName = containerPath.slice(lastSlash + 1);

        return this.getExecContainerCommandArgs({
            container: options.container,
            command: ['tar', '-cf', '-', '-C', directory, fileName],
        });
    }

    // wslc uses `container cp` (there is no top-level `cp`). `container cp - CONTAINER:DIR`
    // extracts a tar archive from stdin into the destination directory (Docker-compatible), which
    // matches the tar stream the caller pipes in for writes.
    protected override getWriteFileCommandArgs(options: WriteFileCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'cp'),
            withArg(options.inputFile || '-'),
            withContainerPathArg(options),
        )();
    }

    //#endregion
}

