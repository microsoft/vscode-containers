/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
    byteStreamToGenerator,
    CancellationError,
    CancellationTokenLike,
    CommandLineArgs,
    composeArgs,
    stringStreamToGenerator,
    toArray,
    withArg,
    withFlagArg,
    withNamedArg,
    withQuotedArg,
    withVerbatimArg
} from '@microsoft/vscode-processutils';
import * as readline from 'readline';
import { ShellQuotedString, ShellQuoting } from 'vscode';
import { GeneratorCommandResponse, PromiseCommandResponse, VoidCommandResponse } from '../../contracts/CommandRunner';
import {
    BuildImageCommandOptions,
    CheckInstallCommandOptions,
    ContainersStatsCommandOptions,
    CreateNetworkCommandOptions,
    CreateVolumeCommandOptions,
    EventItem,
    EventStreamCommandOptions,
    ExecContainerCommandOptions,
    IContainersClient,
    InfoCommandOptions,
    InfoItem,
    InspectContainersCommandOptions,
    InspectContainersItem,
    InspectContextsCommandOptions,
    InspectContextsItem,
    InspectImagesCommandOptions,
    InspectImagesItem,
    InspectNetworksCommandOptions,
    InspectNetworksItem,
    InspectVolumesCommandOptions,
    InspectVolumesItem,
    ListContainersCommandOptions,
    ListContainersItem,
    ListContextItem,
    ListContextsCommandOptions,
    ListFilesCommandOptions,
    ListFilesItem,
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
    PushImageCommandOptions,
    ReadFileCommandOptions,
    RemoveContainersCommandOptions,
    RemoveContextsCommandOptions,
    RemoveImagesCommandOptions,
    RemoveNetworksCommandOptions,
    RemoveVolumesCommandOptions,
    RestartContainersCommandOptions,
    RunContainerCommandOptions,
    StartContainersCommandOptions,
    StatPathCommandOptions,
    StatPathItem,
    StopContainersCommandOptions,
    TagImageCommandOptions,
    UseContextCommandOptions,
    VersionCommandOptions,
    VersionItem,
    WriteFileCommandOptions
} from "../../contracts/ContainerClient";
import { CommandNotSupportedError } from '../../utils/CommandNotSupportedError';
import { asIds } from '../../utils/asIds';
import { dayjs } from '../../utils/dayjs';
import { ConfigurableClient } from '../ConfigurableClient';
import { DockerEventRecordSchema } from './DockerEventRecord';
import { DockerInfoRecordSchema } from './DockerInfoRecord';
import { DockerInspectContainerRecordSchema, normalizeDockerInspectContainerRecord } from './DockerInspectContainerRecord';
import { DockerInspectImageRecordSchema, normalizeDockerInspectImageRecord } from './DockerInspectImageRecord';
import { DockerInspectNetworkRecordSchema, normalizeDockerInspectNetworkRecord } from './DockerInspectNetworkRecord';
import { DockerInspectVolumeRecordSchema, normalizeDockerInspectVolumeRecord } from './DockerInspectVolumeRecord';
import { DockerListContainerRecordSchema, normalizeDockerListContainerRecord } from './DockerListContainerRecord';
import { DockerListImageRecordSchema, normalizeDockerListImageRecord } from "./DockerListImageRecord";
import { DockerListNetworkRecordSchema, normalizeDockerListNetworkRecord } from './DockerListNetworkRecord';
import { DockerVersionRecordSchema } from './DockerVersionRecord';
import { DockerVolumeRecordSchema } from './DockerVolumeRecord';
import { parseDockerLikeLabels } from './parseDockerLikeLabels';
import { parseListFilesCommandLinuxOutput, parseListFilesCommandWindowsOutput } from './parseListFilesCommandOutput';
import { tryParseSize } from './tryParseSize';
import { withContainerPathArg } from './withContainerPathArg';
import { withDockerAddHostArg } from './withDockerAddHostArg';
import { withDockerBuildArg } from './withDockerBuildArg';
import { withDockerEnvArg } from './withDockerEnvArg';
import { withDockerExposePortsArg } from './withDockerExposePortsArg';
import { withDockerBooleanFilterArg, withDockerFilterArg } from './withDockerFilterArg';
import { withDockerIgnoreSizeArg } from './withDockerIgnoreSizeArg';
import { withDockerJsonFormatArg } from "./withDockerJsonFormatArg";
import { withDockerLabelFilterArgs } from "./withDockerLabelFilterArgs";
import { withDockerLabelsArg } from "./withDockerLabelsArg";
import { withDockerMountsArg } from './withDockerMountsArg';
import { withDockerNoTruncArg } from "./withDockerNoTruncArg";
import { withDockerPlatformArg } from './withDockerPlatformArg';
import { withDockerPortsArg } from './withDockerPortsArg';
import { parsePruneLikeOutput } from './parsePruneLikeOutput';

const LinuxStatArguments = '%f %h %g %u %s %X %Y %Z %n';
const WindowsStatArguments = '/A-S /-C /TW';

export abstract class DockerClientBase extends ConfigurableClient implements IContainersClient {
    /**
     * The default registry for Docker-like clients is docker.io AKA Docker Hub
     */
    public readonly defaultRegistry: string = 'docker.io';

    /**
     * The default tag for Docker-like clients is 'latest'
     */
    public readonly defaultTag: string = 'latest';

    /**
     * The default argument given to `--format`
     */
    protected readonly defaultFormatForJson: string = "{{json .}}";

    //#region Information Commands

    protected getInfoCommandArgs(
        options: InfoCommandOptions,
    ): CommandLineArgs {
        return composeArgs(
            withArg('info'),
            withDockerJsonFormatArg(this.defaultFormatForJson),
        )();
    }

    protected parseInfoCommandOutput(output: string, strict: boolean): Promise<InfoItem> {
        const info = DockerInfoRecordSchema.parse(JSON.parse(output));

        return Promise.resolve({
            operatingSystem: info.OperatingSystem,
            osType: info.OSType,
            raw: output,
        });
    }

    info(options: InfoCommandOptions): Promise<PromiseCommandResponse<InfoItem>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getInfoCommandArgs(options),
            parse: (output, strict) => this.parseInfoCommandOutput(output, strict),
        });
    }

    /**
     * Get the command line arguments for a Docker-like client version command
     * @param options Standard version command options
     * @returns Command line args for getting version information from a Docker-like client
     */
    protected getVersionCommandArgs(options: VersionCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('version'),
            withDockerJsonFormatArg(this.defaultFormatForJson),
        )();
    }

    /**
     * Parse/normalize the output from running a Docker-like client version command
     * @param output The standard out from invoking the version command
     * @param strict Use strict parsing to validate the command?
     * @returns
     */
    protected parseVersionCommandOutput(output: string, strict: boolean): Promise<VersionItem> {
        const version = DockerVersionRecordSchema.parse(JSON.parse(output));

        return Promise.resolve({
            client: version.Client.ApiVersion,
            server: version.Server.ApiVersion,
        });
    }

    /**
     * Version command implementation for Docker-like clients
     * @param options Standard version command options
     * @returns A CommandResponse object indicating how to run and parse a version command for this runtime
     */
    version(options: VersionCommandOptions): Promise<PromiseCommandResponse<VersionItem>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getVersionCommandArgs(options),
            parse: (output, strict) => this.parseVersionCommandOutput(output, strict),
        });
    }

    /**
     * Get the command line arguments for a Docker-like client install check command
     * @param options Standard install check command options
     * @returns Command line args for doing install check for a Docker-like client
     */
    protected getCheckInstallCommandArgs(options: CheckInstallCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('-v')
        )();
    }

    /**
     * Install check command implementation for Docker-like clients
     * @param options Standard install check command options
     * @returns A CommandResponse object indicating how to run and parse an install check
     * command for this runtime
     */
    checkInstall(options: CheckInstallCommandOptions): Promise<PromiseCommandResponse<string>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getCheckInstallCommandArgs(options),
            parse: (output) => Promise.resolve(output),
        });
    }

    protected getEventStreamCommandArgs(
        options: EventStreamCommandOptions,
    ): CommandLineArgs {
        return composeArgs(
            withArg('events'),
            withNamedArg('--since', options.since?.toString(), { shouldQuote: !(typeof options.since === 'number') }), // If it's numeric it should not be quoted
            withNamedArg('--until', options.until?.toString(), { shouldQuote: !(typeof options.until === 'number') }), // If it's numeric it should not be quoted
            withDockerLabelFilterArgs(options.labels),
            withDockerFilterArg(options.types?.map((type) => `type=${type}`)),
            withDockerFilterArg(options.events?.map((event) => `event=${event}`)),
            withDockerJsonFormatArg(this.defaultFormatForJson),
        )();
    }

    protected async *parseEventStreamCommandOutput(
        options: EventStreamCommandOptions,
        output: NodeJS.ReadableStream,
        strict: boolean,
        cancellationToken?: CancellationTokenLike
    ): AsyncGenerator<EventItem> {
        cancellationToken ??= CancellationTokenLike.None;

        const lineReader = readline.createInterface({
            input: output,
            crlfDelay: Infinity,
        });

        for await (const line of lineReader) {
            if (cancellationToken.isCancellationRequested) {
                throw new CancellationError('Event stream cancelled', cancellationToken);
            }

            try {
                // Parse a line at a time
                const item = DockerEventRecordSchema.parse(JSON.parse(line));

                // Yield the parsed data
                yield {
                    type: item.Type,
                    action: item.Action,
                    actor: { id: item.Actor.ID, attributes: item.Actor.Attributes },
                    timestamp: new Date(item.time),
                    raw: line,
                };
            } catch (err) {
                if (strict) {
                    throw err;
                }
            }
        }
    }

    getEventStream(options: EventStreamCommandOptions): Promise<GeneratorCommandResponse<EventItem>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getEventStreamCommandArgs(options),
            parseStream: (output, strict) => this.parseEventStreamCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region Auth Commands

    protected getLoginCommandArgs(options: LoginCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('login'),
            withNamedArg('--username', options.username),
            withArg('--password-stdin'),
            withArg(options.registry),
        )();
    }

    login(options: LoginCommandOptions): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getLoginCommandArgs(options),
        });
    }

    protected getLogoutCommandArgs(options: LogoutCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('logout'),
            withArg(options.registry),
        )();
    }

    logout(options: LogoutCommandOptions): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getLogoutCommandArgs(options),
        });
    }

    //#endregion

    //#region Image Commands

    //#region BuildImage Command

    /**
     * Get build image command arguments for the current runtime
     * @param options Standard build image command options
     * @returns Command line args for running a build image command on the current runtime
     */
    protected getBuildImageCommandArgs(options: BuildImageCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'build'),
            withFlagArg('--pull', options.pull),
            withNamedArg('--file', options.file),
            withNamedArg('--target', options.stage),
            withNamedArg('--tag', options.tags),
            withNamedArg(
                '--disable-content-trust',
                typeof options.disableContentTrust === 'boolean'
                    ? options.disableContentTrust.toString()
                    : options.disableContentTrust),
            withDockerLabelsArg(options.labels),
            withNamedArg('--iidfile', options.imageIdFile),
            withDockerPlatformArg(options.platform),
            withDockerBuildArg(options.args),
            withVerbatimArg(options.customOptions),
            withQuotedArg(options.path),
        )();
    }

    /**
     * Implements the build image command for a Docker-like runtime
     * @param options Standard build image command options
     * @returns A CommandResponse object that can be used to invoke and parse the build image command for the current runtime
     */
    buildImage(options: BuildImageCommandOptions): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getBuildImageCommandArgs(options),
        });
    }

    //#endregion

    //#region ListImages Command

    /**
     * Get list images command arguments for the current runtime
     * @param options The process that runs the list images command for a given runtime
     * @returns Command line args for running a list image command on the current runtime
     */
    protected getListImagesCommandArgs(options: ListImagesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'ls'),
            withFlagArg('--all', options.all),
            withDockerBooleanFilterArg('dangling', options.dangling),
            withDockerFilterArg(options.references?.map((reference) => `reference=${reference}`)),
            withDockerLabelFilterArgs(options.labels),
            withDockerNoTruncArg,
            withDockerJsonFormatArg(this.defaultFormatForJson),
        )();
    }

    /**
     * Parse and normalize the standard out from a Docker-like list images command
     * @param options List images command options
     * @param output The standard out from the list images command
     * @param strict Should the output be strictly parsed?
     * @returns A normalized array of ListImagesItem records
     */
    protected parseListImagesCommandOutput(
        options: ListImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<ListImagesItem>> {
        const images = new Array<ListImagesItem>();
        try {
            // Docker returns JSON per-line output, so we need to split each line
            // and parse as independent JSON objects
            output.split('\n').forEach((imageJson) => {
                try {
                    // Ignore empty lines when parsing
                    if (!imageJson) {
                        return;
                    }

                    const rawImage = DockerListImageRecordSchema.parse(JSON.parse(imageJson));
                    images.push(normalizeDockerListImageRecord(rawImage));
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }
            });
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return Promise.resolve(images);
    }

    /**
     * Generates the necessary information for running and parsing the results
     * of a list image command for a Docker-like client
     * @param options Standard list images command options
     * @returns A CommandResponse indicating how to run and parse/normalize a list image command for a Docker-like client
     */
    listImages(options: ListImagesCommandOptions): Promise<PromiseCommandResponse<Array<ListImagesItem>>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getListImagesCommandArgs(options),
            parse: (output, strict) => this.parseListImagesCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region RemoveImages Command

    protected getRemoveImagesCommandArgs(options: RemoveImagesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'rm'), // Docker supports both `remove` and `rm`, but Podman supports only `rm`
            withFlagArg('--force', options.force),
            withArg(...options.imageRefs),
        )();
    }

    protected parseRemoveImagesCommandOutput(
        options: RemoveImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<string>> {
        return Promise.resolve(asIds(output));
    }

    removeImages(options: RemoveImagesCommandOptions): Promise<PromiseCommandResponse<string[]>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getRemoveImagesCommandArgs(options),
            parse: (output, strict) => this.parseRemoveImagesCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region PushImage Command

    protected getPushImageCommandArgs(options: PushImageCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'push'),
            withArg(options.imageRef),
        )();
    }

    pushImage(options: PushImageCommandOptions): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getPushImageCommandArgs(options),
        });
    }

    //#endregion

    //#region PruneImages Command

    protected getPruneImagesCommandArgs(options: PruneImagesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'prune'),
            withArg('--force'),
            withFlagArg('--all', options.all),
        )();
    }

    protected parsePruneImagesCommandOutput(
        options: PruneImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneImagesItem> {
        const deletedImageLineRegex = /^(?:deleted:\s*sha256:\s*)(\w+)$/igm;

        const deletedImages = parsePruneLikeOutput(output, {
            resourceRegex: deletedImageLineRegex,
        });

        return Promise.resolve({
            imageRefsDeleted: deletedImages.resources,
            spaceReclaimed: deletedImages.spaceReclaimed,
        });
    }

    pruneImages(options: PruneImagesCommandOptions): Promise<PromiseCommandResponse<PruneImagesItem>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getPruneImagesCommandArgs(options),
            parse: (output, strict) => this.parsePruneImagesCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region PullImage Command

    /**
     * Generate the command line arguments for invoking a pull image command on
     * a Docker-like client
     * @param options Pull image command options
     * @returns Command line arguments for pulling a container image
     */
    protected getPullImageCommandArgs(options: PullImageCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'pull'),
            withFlagArg('--all-tags', options.allTags),
            withNamedArg(
                '--disable-content-trust',
                typeof options.disableContentTrust === 'boolean'
                    ? options.disableContentTrust.toString()
                    : undefined),
            withArg(options.imageRef),
        )();
    }

    pullImage(options: PullImageCommandOptions): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getPullImageCommandArgs(options),
        });
    }

    //#endregion

    //#region TagImage Command

    protected getTagImageCommandArgs(options: TagImageCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'tag'),
            withArg(options.fromImageRef, options.toImageRef),
        )();
    }

    tagImage(options: TagImageCommandOptions): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getTagImageCommandArgs(options),
        });
    }

    //#endregion

    //#region InspectImages Command

    /**
     * Generate the command line arguments to run an inspect images command on a
     * Docker-like client
     * @param options Standard inspect images options
     * @returns Command line args to run an inspect images command on a given Docker-like client
     */
    protected getInspectImagesCommandArgs(
        options: InspectImagesCommandOptions,
    ): CommandLineArgs {
        return composeArgs(
            withArg('image', 'inspect'),
            withDockerJsonFormatArg(this.defaultFormatForJson),
            withArg(...options.imageRefs),
        )();
    }

    /**
     * Parse the standard output from a Docker-like inspect images command and
     * normalize the result
     * @param options Inspect images command options
     * @param output The standard out from the inspect images command
     * @param strict Should strict parsing be enforced?
     * @returns Normalized array of InspectImagesItem records
     */
    protected parseInspectImagesCommandOutput(
        options: InspectImagesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectImagesItem>> {
        try {
            const images = output.split('\n').reduce<Array<InspectImagesItem>>((images, inspectString) => {
                if (!inspectString) {
                    return images;
                }

                try {
                    const inspect = DockerInspectImageRecordSchema.parse(JSON.parse(inspectString));
                    return [...images, normalizeDockerInspectImageRecord(inspect, inspectString)];
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }

                return images;
            }, new Array<InspectImagesItem>());

            return Promise.resolve(images);
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        // If there were no image records or there was a parsing error but
        // strict parsing was disabled, return an empty array
        return Promise.resolve(new Array<InspectImagesItem>());
    }

    inspectImages(options: InspectImagesCommandOptions): Promise<PromiseCommandResponse<Array<InspectImagesItem>>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getInspectImagesCommandArgs(options),
            parse: (output, strict) => this.parseInspectImagesCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#endregion

    //#region Container Commands

    //#region RunContainer Command

    /**
     * Generate the command line arguments for a Docker-like run container
     * command
     * @param options Standard run container options
     * @returns Command line arguments for a Docker-like run container command
     */
    protected getRunContainerCommandArgs(options: RunContainerCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'run'),
            withFlagArg('--detach', options.detached),
            withFlagArg('--interactive', options.interactive),
            withFlagArg('--tty', options.detached || options.interactive),
            withFlagArg('--rm', options.removeOnExit),
            withNamedArg('--name', options.name),
            withDockerPortsArg(options.ports),
            withFlagArg('--publish-all', options.publishAllPorts),
            withNamedArg('--network', options.network),
            withNamedArg('--network-alias', options.networkAlias),
            withDockerAddHostArg(options.addHost),
            withDockerMountsArg(options.mounts),
            withDockerLabelsArg(options.labels),
            withDockerEnvArg(options.environmentVariables),
            withNamedArg('--env-file', options.environmentFiles),
            withNamedArg('--entrypoint', options.entrypoint),
            withDockerExposePortsArg(options.exposePorts),
            withDockerPlatformArg(options.platform),
            withVerbatimArg(options.customOptions),
            withArg(options.imageRef),
            typeof options.command === 'string' ? withVerbatimArg(options.command) : withArg(...(toArray(options.command ?? []))),
        )();
    }

    /**
     * Parse standard output for a run container command
     * @param options The standard run container command options
     * @param output Standard output for a run container command
     * @param strict Should strict parsing be enforced
     * @returns The container ID if running detached or standard out if running attached
     */
    protected parseRunContainerCommandOutput(
        options: RunContainerCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<string | undefined> {
        return Promise.resolve(options.detached ? output.split('\n', 1)[0] : output);
    }

    /**
     * Generate a CommandResponse for a Docker-like run container command that includes how to run and parse command output
     * @param options Standard run container command options
     * @returns A CommandResponse object for a Docker-like run container command
     */
    runContainer(options: RunContainerCommandOptions): Promise<PromiseCommandResponse<string | undefined>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getRunContainerCommandArgs(options),
            parse: (output, strict) => this.parseRunContainerCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region ExecContainer Command

    protected getExecContainerCommandArgs(options: ExecContainerCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'exec'),
            withFlagArg('--interactive', options.interactive),
            withFlagArg('--detached', options.detached),
            withFlagArg('--tty', options.tty),
            withDockerEnvArg(options.environmentVariables),
            withArg(options.container),
            typeof options.command === 'string' ? withVerbatimArg(options.command) : withArg(...toArray(options.command)),
        )();
    }

    execContainer(options: ExecContainerCommandOptions): Promise<GeneratorCommandResponse<string>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getExecContainerCommandArgs(options),
            parseStream: (output, strict) => stringStreamToGenerator(output),
        });
    }

    //#endregion

    //#region ListContainers Command

    protected getListContainersCommandArgs(
        options: ListContainersCommandOptions,
    ): CommandLineArgs {
        return composeArgs(
            withArg('container', 'ls'),
            withFlagArg('--all', options.all),
            withDockerLabelFilterArgs(options.labels),
            withDockerFilterArg(options.running ? 'status=running' : undefined),
            withDockerFilterArg(options.exited ? 'status=exited' : undefined),
            withDockerFilterArg(options.names?.map((name) => `name=${name}`)),
            withDockerFilterArg(options.imageAncestors?.map((id) => `ancestor=${id}`)),
            withDockerFilterArg(options.volumes?.map((volume) => `volume=${volume}`)),
            withDockerFilterArg(options.networks?.map((network) => `network=${network}`)),
            withDockerNoTruncArg,
            withDockerJsonFormatArg(this.defaultFormatForJson),
            withDockerIgnoreSizeArg,
        )();
    }

    protected parseListContainersCommandOutput(
        options: ListContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<ListContainersItem>> {
        const containers = new Array<ListContainersItem>();
        try {
            output.split('\n').forEach((containerJson) => {
                try {
                    if (!containerJson) {
                        return;
                    }

                    const rawContainer = DockerListContainerRecordSchema.parse(JSON.parse(containerJson));
                    containers.push(normalizeDockerListContainerRecord(rawContainer, strict));
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }
            });
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return Promise.resolve(containers);
    }

    listContainers(options: ListContainersCommandOptions): Promise<PromiseCommandResponse<Array<ListContainersItem>>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getListContainersCommandArgs(options),
            parse: (output, strict) => this.parseListContainersCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region StartContainers Command

    protected getStartContainersCommandArgs(options: StartContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'start'),
            withArg(...toArray(options.container)),
        )();
    }

    protected parseStartContainersCommandOutput(
        options: StartContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<string>> {
        return Promise.resolve(asIds(output));
    }

    startContainers(options: StartContainersCommandOptions): Promise<PromiseCommandResponse<Array<string>>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getStartContainersCommandArgs(options),
            parse: (output, strict) => this.parseStartContainersCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region RestartContainers Command

    protected getRestartContainersCommandArgs(options: RestartContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'restart'),
            withNamedArg('--time', typeof options.time === 'number' ? options.time.toString() : undefined),
            withArg(...toArray(options.container)),
        )();
    }

    protected parseRestartContainersCommandOutput(
        options: RestartContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<string>> {
        return Promise.resolve(asIds(output));
    }

    restartContainers(options: RestartContainersCommandOptions): Promise<PromiseCommandResponse<Array<string>>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getRestartContainersCommandArgs(options),
            parse: (output, strict) => this.parseRestartContainersCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region StopContainers Command

    /**
     * Generate command line arguments for running a stop container command
     * @param options Standard stop container command options
     * @returns The command line arguments required to run the stop container command on a Docker-like runtime
     */
    protected getStopContainersCommandArgs(options: StopContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'stop'),
            withNamedArg('--time', typeof options.time === 'number' ? options.time.toString() : undefined),
            withArg(...toArray(options.container)),
        )();
    }

    /**
     * Parse the standard output from running a stop container command on a Docker-like runtime
     * @param options Stop container command options
     * @param output The standard out from the stop containers command
     * @param strict Should strict parsing be enforced
     * @returns A list of IDs for containers that were stopped
     */
    protected parseStopContainersCommandOutput(
        options: StopContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<string>> {
        return Promise.resolve(asIds(output));
    }

    stopContainers(options: StopContainersCommandOptions): Promise<PromiseCommandResponse<Array<string>>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getStopContainersCommandArgs(options),
            parse: (output, strict) => this.parseStopContainersCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region RemoveContainers Command

    protected getRemoveContainersCommandArgs(options: RemoveContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'rm'),
            withFlagArg('--force', options.force),
            withArg(...options.containers),
        )();
    }

    protected parseRemoveContainersCommandOutput(
        options: RemoveContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<string>> {
        return Promise.resolve(asIds(output));
    }

    removeContainers(options: RemoveContainersCommandOptions): Promise<PromiseCommandResponse<Array<string>>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getRemoveContainersCommandArgs(options),
            parse: (output, strict) => this.parseRemoveContainersCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region PruneContainers Command

    protected getPruneContainersCommandArgs(options: PruneContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'prune'),
            withArg('--force'),
        )();
    }

    protected parsePruneContainersCommandOutput(
        options: PruneContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneContainersItem> {
        const deletedContainerItems = parsePruneLikeOutput(output, {
            resourceRegex: undefined, // the line is the container ID itself
        });

        return Promise.resolve({
            containersDeleted: deletedContainerItems.resources,
            spaceReclaimed: deletedContainerItems.spaceReclaimed,
        });
    }

    pruneContainers(options: PruneContainersCommandOptions): Promise<PromiseCommandResponse<PruneContainersItem>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getPruneContainersCommandArgs(options),
            parse: (output, strict) => this.parsePruneContainersCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region StatsContainers Command

    protected getStatsContainersCommandArgs(options: ContainersStatsCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'stats'),
            withFlagArg('--all', options.all),
        )();
    }

    statsContainers(options: ContainersStatsCommandOptions): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getStatsContainersCommandArgs(options),
        });
    }

    //#endregion

    //#region LogsForContainer Command

    /**
     * Generate the command line arguments for the log container command on a
     * Docker-like client
     * @param options Options for log container command
     * @returns Command line arguments to invoke a log container command on a Docker-like client
     */
    protected getLogsForContainerCommandArgs(options: LogsForContainerCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'logs'),
            withFlagArg('--follow', options.follow),
            withFlagArg('--timestamps', options.timestamps),
            withNamedArg('--tail', options.tail?.toString()),
            withNamedArg('--since', options.since),
            withNamedArg('--until', options.until),
            withArg(options.container),
        )();
    }

    /**
     * Generate a CommandResponse object for a Docker-like log container command
     * @param options Options for the log container command
     * @returns The CommandResponse object for the log container command
     */
    logsForContainer(options: LogsForContainerCommandOptions): Promise<GeneratorCommandResponse<string>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getLogsForContainerCommandArgs(options),
            parseStream: (output, strict) => stringStreamToGenerator(output),
        });
    }

    //#endregion

    //#region InspectContainers Command

    /**
     * Override this method if the default inspect containers args need to be changed for a given runtime
     * @param options Inspect containers command options
     * @returns Command line args for invoking inspect containers on a Docker-like client
     */
    protected getInspectContainersCommandArgs(
        options: InspectContainersCommandOptions,
    ): CommandLineArgs {
        return composeArgs(
            withArg('container', 'inspect'),
            withDockerJsonFormatArg(this.defaultFormatForJson),
            withArg(...options.containers)
        )();
    }

    /**
     * Parse the output from running an inspect containers command on a Docker-like client
     * @param options Inspect containers command options
     * @param output Standard out from running a Docker-like inspect containers command
     * @param strict Should strict parsing be used to parse the output?
     * @returns An array of InspectContainersItem records
     */
    protected parseInspectContainersCommandOutput(
        options: InspectContainersCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectContainersItem>> {
        try {
            const containers = output.split('\n').reduce<Array<InspectContainersItem>>((containers, inspectString) => {
                if (!inspectString) {
                    return containers;
                }

                try {
                    const inspect = DockerInspectContainerRecordSchema.parse(JSON.parse(inspectString));
                    return [...containers, normalizeDockerInspectContainerRecord(inspect, inspectString)];
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }

                return containers;
            }, new Array<InspectContainersItem>());

            return Promise.resolve(containers);
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return Promise.resolve(new Array<InspectContainersItem>());
    }

    inspectContainers(
        options: InspectContainersCommandOptions,
    ): Promise<PromiseCommandResponse<InspectContainersItem[]>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getInspectContainersCommandArgs(options),
            parse: (output, strict) => this.parseInspectContainersCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#endregion

    //#region Volume Commands

    //#region CreateVolume Command

    protected getCreateVolumeCommandArgs(options: CreateVolumeCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'create'),
            withNamedArg('--driver', options.driver),
            withArg(options.name),
        )();
    }

    createVolume(options: CreateVolumeCommandOptions): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getCreateVolumeCommandArgs(options),
        });
    }

    //#endregion

    //#region ListVolumes Command

    protected getListVolumesCommandArgs(options: ListVolumesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'ls'),
            withDockerBooleanFilterArg('dangling', options.dangling),
            withDockerFilterArg(options.driver ? `driver=${options.driver}` : undefined),
            withDockerLabelFilterArgs(options.labels),
            withDockerJsonFormatArg(this.defaultFormatForJson),
        )();
    }

    protected parseListVolumesCommandOutput(
        options: ListVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<ListVolumeItem[]> {
        const volumes = new Array<ListVolumeItem>();
        try {
            output.split("\n").forEach((volumeJson) => {
                try {
                    if (!volumeJson) {
                        return;
                    }

                    const rawVolume = DockerVolumeRecordSchema.parse(JSON.parse(volumeJson));

                    // Parse the labels assigned to the volumes and normalize to key value pairs
                    const labels = parseDockerLikeLabels(rawVolume.Labels);

                    const createdAt = rawVolume.CreatedAt
                        ? dayjs.utc(rawVolume.CreatedAt)
                        : undefined;

                    const size = tryParseSize(rawVolume.Size);

                    volumes.push({
                        name: rawVolume.Name,
                        driver: rawVolume.Driver,
                        labels,
                        mountpoint: rawVolume.Mountpoint,
                        scope: rawVolume.Scope,
                        createdAt: createdAt?.toDate(),
                        size
                    });
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }
            });
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return Promise.resolve(volumes);
    }

    listVolumes(options: ListVolumesCommandOptions): Promise<PromiseCommandResponse<ListVolumeItem[]>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getListVolumesCommandArgs(options),
            parse: (output, strict) => this.parseListVolumesCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region RemoveVolumes Command

    /**
     * Generate the command line arguments for a Docker-like remove volumes
     * command
     * @param options Remove volumes command options
     * @returns Command line arguments for invoking a remove volumes command
     */
    protected getRemoveVolumesCommandArgs(options: RemoveVolumesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'rm'),
            withFlagArg('--force', options.force),
            withArg(...options.volumes),
        )();
    }

    /**
     * Parse the output from running a Docker-like remove volumes command
     * @param options Options for the remove volumes command
     * @param output Standard out from running the remove volumes command
     * @param strict Should strict parsing be enforced?
     * @returns A list of IDs for the volumes removed
     */
    protected parseRemoveVolumesCommandOutput(
        options: RemoveVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<string[]> {
        return Promise.resolve(asIds(output));
    }

    /**
     * Generate a CommandResponse instance for a Docker-like remove volumes
     * command
     * @param options Options for remove volumes command
     * @returns CommandResponse for the remove volumes command
     */
    removeVolumes(options: RemoveVolumesCommandOptions): Promise<PromiseCommandResponse<string[]>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getRemoveVolumesCommandArgs(options),
            parse: (output, strict) => this.parseRemoveVolumesCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region PruneVolumes Command

    protected getPruneVolumesCommandArgs(options: PruneVolumesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'prune'),
            withArg('--force'),
        )();
    }

    protected parsePruneVolumesCommandOutput(
        options: PruneVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneVolumesItem> {
        const deletedVolumes = parsePruneLikeOutput(output, {
            resourceRegex: undefined, // the line is the volume name or ID itself
        });

        return Promise.resolve({
            volumesDeleted: deletedVolumes.resources,
            spaceReclaimed: deletedVolumes.spaceReclaimed,
        });
    }

    pruneVolumes(options: PruneVolumesCommandOptions): Promise<PromiseCommandResponse<PruneVolumesItem>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getPruneVolumesCommandArgs(options),
            parse: (output, strict) => this.parsePruneVolumesCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region InspectVolumes Command

    protected getInspectVolumesCommandArgs(
        options: InspectVolumesCommandOptions,
    ): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'inspect'),
            withDockerJsonFormatArg(this.defaultFormatForJson),
            withArg(...options.volumes),
        )();
    }

    protected parseInspectVolumesCommandOutput(
        options: InspectVolumesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectVolumesItem>> {
        try {
            const volumes = output.split('\n').reduce<Array<InspectVolumesItem>>((volumes, inspectString) => {
                if (!inspectString) {
                    return volumes;
                }

                try {
                    const inspect = DockerInspectVolumeRecordSchema.parse(JSON.parse(inspectString));
                    return [...volumes, normalizeDockerInspectVolumeRecord(inspect, inspectString)];
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }

                return volumes;
            }, new Array<InspectVolumesItem>());

            return Promise.resolve(volumes);
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return Promise.resolve(new Array<InspectVolumesItem>());
    }

    inspectVolumes(options: InspectVolumesCommandOptions): Promise<PromiseCommandResponse<Array<InspectVolumesItem>>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getInspectVolumesCommandArgs(options),
            parse: (output, strict) => this.parseInspectVolumesCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#endregion

    //#region Network Commands

    //#region CreateNetwork Command

    protected getCreateNetworkCommandArgs(options: CreateNetworkCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('network', 'create'),
            withNamedArg('--driver', options.driver),
            withArg(options.name),
        )();
    }

    createNetwork(options: CreateNetworkCommandOptions): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getCreateNetworkCommandArgs(options),
        });
    }

    //#endregion

    //#region ListNetworks Command

    protected getListNetworksCommandArgs(
        options: ListNetworksCommandOptions,
    ): CommandLineArgs {
        return composeArgs(
            withArg('network', 'ls'),
            withDockerLabelFilterArgs(options.labels),
            withDockerNoTruncArg,
            withDockerJsonFormatArg(this.defaultFormatForJson),
        )();
    }

    protected parseListNetworksCommandOutput(
        options: ListNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<ListNetworkItem>> {
        const networks = new Array<ListNetworkItem>();
        try {
            output.split("\n").forEach((networkJson) => {
                try {
                    if (!networkJson) {
                        return;
                    }

                    const rawNetwork = DockerListNetworkRecordSchema.parse(JSON.parse(networkJson));
                    networks.push(normalizeDockerListNetworkRecord(rawNetwork));
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }
            });
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return Promise.resolve(networks);
    }

    listNetworks(options: ListNetworksCommandOptions): Promise<PromiseCommandResponse<Array<ListNetworkItem>>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getListNetworksCommandArgs(options),
            parse: (output, strict) => this.parseListNetworksCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region RemoveNetworks Command

    protected getRemoveNetworksCommandArgs(options: RemoveNetworksCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('network', 'remove'),
            withFlagArg('--force', options.force),
            withArg(...options.networks),
        )();
    }

    protected parseRemoveNetworksCommandOutput(
        options: RemoveNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<string>> {
        return Promise.resolve(output.split('\n').map((id) => id));
    }

    removeNetworks(options: RemoveNetworksCommandOptions): Promise<PromiseCommandResponse<Array<string>>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getRemoveNetworksCommandArgs(options),
            parse: (output, strict) => this.parseRemoveNetworksCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region PruneNetworks Command

    protected getPruneNetworksCommandArgs(options: PruneNetworksCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('network', 'prune'),
            withArg('--force'),
        )();
    }

    protected parsePruneNetworksCommandOutput(
        options: PruneNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<PruneNetworksItem> {
        let networks: string[] = [];
        const deletedNetworkStartString = "Deleted Networks:";

        if (output.includes(deletedNetworkStartString)) {
            networks = asIds(output.replace(deletedNetworkStartString, ""));
        }

        return Promise.resolve({
            networksDeleted: networks,
        });
    }

    pruneNetworks(options: PruneNetworksCommandOptions): Promise<PromiseCommandResponse<PruneNetworksItem>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getPruneNetworksCommandArgs(options),
            parse: (output, strict) => this.parsePruneNetworksCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region InspectNetworks Command

    protected getInspectNetworksCommandArgs(
        options: InspectNetworksCommandOptions,
    ): CommandLineArgs {
        return composeArgs(
            withArg('network', 'inspect'),
            withDockerJsonFormatArg(this.defaultFormatForJson),
            withArg(...options.networks),
        )();
    }

    protected parseInspectNetworksCommandOutput(
        options: InspectNetworksCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<Array<InspectNetworksItem>> {
        try {
            const networks = output.split('\n').reduce<Array<InspectNetworksItem>>((networks, inspectString) => {
                if (!inspectString) {
                    return networks;
                }

                try {
                    const inspect = DockerInspectNetworkRecordSchema.parse(JSON.parse(inspectString));
                    return [...networks, normalizeDockerInspectNetworkRecord(inspect, inspectString)];
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }

                return networks;
            }, new Array<InspectNetworksItem>());

            return Promise.resolve(networks);
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return Promise.resolve(new Array<InspectNetworksItem>());
    }

    inspectNetworks(options: InspectNetworksCommandOptions): Promise<PromiseCommandResponse<InspectNetworksItem[]>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getInspectNetworksCommandArgs(options),
            parse: (output, strict) => this.parseInspectNetworksCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#endregion

    //#region Context Commands

    //#region ListContexts Command

    listContexts(options: ListContextsCommandOptions): Promise<PromiseCommandResponse<ListContextItem[]>> {
        return Promise.reject(new CommandNotSupportedError('listContexts is not supported for this runtime'));
    }

    //#endregion

    //#region RemoveContexts Command

    removeContexts(options: RemoveContextsCommandOptions): Promise<PromiseCommandResponse<string[]>> {
        return Promise.reject(new CommandNotSupportedError('removeContexts is not supported for this runtime'));
    }

    //#endregion

    //#region UseContext Command

    useContext(options: UseContextCommandOptions): Promise<VoidCommandResponse> {
        return Promise.reject(new CommandNotSupportedError('useContext is not supported for this runtime'));
    }

    //#endregion

    //#region InspectContexts Command

    inspectContexts(options: InspectContextsCommandOptions): Promise<PromiseCommandResponse<InspectContextsItem[]>> {
        return Promise.reject(new CommandNotSupportedError('inspectContexts is not supported for this runtime'));
    }

    //#endregion

    //#endregion

    //#region File Commands

    //#region ListFiles Command

    protected getListFilesCommandArgs(options: ListFilesCommandOptions): CommandLineArgs {
        let command: (string | ShellQuotedString)[];
        if (options.operatingSystem === 'windows') {
            command = [
                'cmd',
                '/D',
                '/S',
                '/C',
                `dir ${WindowsStatArguments} "${options.path}"`,
            ];
        } else {
            const dirPath = options.path.endsWith('/') ? options.path : options.path + '/';
            // Calling stat <path>/* on an empty directory returns an error code, while stat <path>/.* may not match
            // implicit . and .. relative folders depending on system configuration. Therefore we call stat for both wildcard
            // patterns and suppress errors with || true. Additionally, we explicitly call stat for the implicit . path and if
            // there are any legitimate issues invoking stat in a given container, this call should still fail and surface the
            // actual error, allowing us to suppress a false error without suppressing legitimate issues.
            command = [
                '/bin/sh',
                '-c',
                { value: `stat -c '${LinuxStatArguments}' "${dirPath}"* || true && stat -c '${LinuxStatArguments}' "${dirPath}".* || true && stat -c '${LinuxStatArguments}' "${dirPath}".`, quoting: ShellQuoting.Strong },
            ];
        }

        return this.getExecContainerCommandArgs(
            {
                container: options.container,
                interactive: true,
                command,
            }
        );
    }

    protected parseListFilesCommandOutput(
        options: ListFilesCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<ListFilesItem[]> {
        if (options.operatingSystem === 'windows') {
            return Promise.resolve(parseListFilesCommandWindowsOutput(options, output));
        } else {
            return Promise.resolve(parseListFilesCommandLinuxOutput(options, output));
        }
    }

    listFiles(options: ListFilesCommandOptions): Promise<PromiseCommandResponse<ListFilesItem[]>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getListFilesCommandArgs(options),
            parse: (output, strict) => this.parseListFilesCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region StatPath Command

    protected getStatPathCommandArgs(options: StatPathCommandOptions): CommandLineArgs {
        let command: (string | ShellQuotedString)[];
        if (options.operatingSystem === 'windows') {
            command = [
                'cmd',
                '/D',
                '/S',
                '/C',
                `dir ${WindowsStatArguments} "${options.path}"`,
            ];
        } else {
            command = [
                '/bin/sh',
                '-c',
                { value: `stat -c '${LinuxStatArguments}' "${options.path}"`, quoting: ShellQuoting.Strong },
            ];
        }

        return this.getExecContainerCommandArgs(
            {
                container: options.container,
                interactive: true,
                command,
            }
        );
    }

    protected parseStatPathCommandOutput(
        options: StatPathCommandOptions,
        output: string,
        strict: boolean,
    ): Promise<StatPathItem | undefined> {
        if (options.operatingSystem === 'windows') {
            return Promise.resolve(parseListFilesCommandWindowsOutput(options, output).shift());
        } else {
            return Promise.resolve(parseListFilesCommandLinuxOutput(options, output).shift());
        }
    }

    statPath(options: StatPathCommandOptions): Promise<PromiseCommandResponse<StatPathItem | undefined>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getStatPathCommandArgs(options),
            parse: (output, strict) => this.parseStatPathCommandOutput(options, output, strict),
        });
    }

    //#endregion

    //#region ReadFile Command

    protected getReadFileCommandArgs(options: ReadFileCommandOptions): CommandLineArgs {
        if (options.operatingSystem === 'windows') {
            const command = [
                'cmd',
                '/D',
                '/S',
                '/C',
                `type "${options.path}"`,
            ];

            return this.getExecContainerCommandArgs(
                {
                    container: options.container,
                    interactive: true,
                    command,
                }
            );
        } else {
            return composeArgs(
                withArg('cp'),
                withContainerPathArg(options),
                withArg('-'),
            )();
        }
    }

    readFile(options: ReadFileCommandOptions): Promise<GeneratorCommandResponse<Buffer>> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getReadFileCommandArgs(options),
            parseStream: (output, strict) => byteStreamToGenerator(output),
        });
    }

    //#endregion

    //#region WriteFile Command

    protected getWriteFileCommandArgs(options: WriteFileCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('cp'),
            withArg(options.inputFile || '-'),
            withContainerPathArg(options),
        )();
    }

    writeFile(options: WriteFileCommandOptions): Promise<VoidCommandResponse> {
        return Promise.resolve({
            command: this.commandName,
            args: this.getWriteFileCommandArgs(options),
        });
    }

    //#endregion

    //#endregion
}
