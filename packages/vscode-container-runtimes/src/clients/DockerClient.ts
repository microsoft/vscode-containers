/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as dayjs from 'dayjs';
import * as customParseFormat from 'dayjs/plugin/customParseFormat';
import * as utc from 'dayjs/plugin/utc';

import {
    BuildImageCommandOptions,
    CommandResponse,
    CreateVolumeCommandOptions,
    ExecContainerCommandOptions,
    IContainersClient,
    InspectContainersCommandOptions,
    InspectContainersItem,
    InspectContainersItemMount,
    InspectContainersItemNetwork,
    InspectImagesCommandOptions,
    InspectImagesItem,
    LabelFilters,
    Labels,
    ListContainersItem,
    ListContainersCommandOptions,
    ListImagesItem,
    ListImagesCommandOptions,
    ListVolumeItem,
    ListVolumesCommandOptions,
    LogsForContainerCommandOptions,
    PortBinding,
    PruneImagesCommandOptions,
    PullImageCommandOptions,
    RemoveContainersCommandOptions,
    RemoveVolumesCommandOptions,
    RunContainerCommandOptions,
    RunContainerMount,
    StopContainersCommandOptions,
    TagImageCommandOptions,
    VersionCommandOptions,
    VersionItem,
} from '../contracts/ContainerClient';
import {
    CommandLineArgs,
    composeArgs,
    quoted,
    withArg,
    withFlagArg,
    withNamedArg
} from '../utils/commandLineBuilder';
import { toArray } from '../utils/toArray';

dayjs.extend(customParseFormat);
dayjs.extend(utc);

const DOCKER_COMMAND: string = 'docker';

const DOCKER_LIST_DATE_FORMAT: string = 'YYYY-MM-DD HH:mm:ss ZZ';

/**
 * Template string processor that conditionally excludes string literal components that precede an expression
 * that evaluates to an empty string, null, or undefined. Specifically intended to simplify filtering for
 * label strings in a map/reduce.
 * @param strings String literal components of a template string
 * @param expr Expression components of a template string
 * @returns The resulting string where string literals before an expression are conditionally excluded
 */
function conditional(strings: TemplateStringsArray, ...expr: Array<string | null | undefined>): string {
    return expr.reduce<string>(
        (accumulator, currentExpr, index) => {
            if (!!currentExpr) {
                return accumulator + strings[index] + currentExpr;
            }

            return accumulator;
        },
        '',
    ) + strings.slice(-1);
}

const templateJson = (strings: TemplateStringsArray, ...expr: Array<string>): string => {
    return '{{json ' + expr.reduce<string>((accum, cur, index) => accum + strings[index] + expr, '') + strings.slice(-1) + '}}';
};
type JsonFormatOptions<T> = Record<Extract<keyof T, string>, string>;
const normalizedJsonFormat = <T>(formatMapping: JsonFormatOptions<T>, overrideMapping: Partial<JsonFormatOptions<T>> = {}): string => {
    const mappings = {
        ...formatMapping,
        ...overrideMapping || {},
    };

    const keyMappings = Object.entries(mappings).map(([key, value]) => {
        return `"${key}":${value}`;
    });
    return `{${keyMappings.join(',')}}`;
};

const formatLabelFilter = (name: string, value: boolean | string): string | undefined => {
    if (typeof value === 'boolean' && value) {
        return `label=${name}`;
    } else if (typeof value === 'string') {
        return conditional`label=${name}=${value}`;
    }

    return undefined;
};

const formatMount = (mount: RunContainerMount): string => {
    const mountParts = new Array<string>(
        `type=${mount.type}`,
        `source=${mount.source}`,
        `destination=${mount.destination}`,
        mount.readOnly ? 'readonly' : '',
    );

    return mountParts.filter((part) => !!part).join(',');
};

const withLabelFilterArgs = (labels?: LabelFilters) => withNamedArg('--filter', Object.entries(labels || {}).map(([label, value]) => formatLabelFilter(label, value)));
const withLabelsArg = (labels?: Labels) => withNamedArg('--label', Object.entries(labels || {}).map(([label, value]) => `${label}=${value}`));
const withPortsArg = (ports?: Array<PortBinding>) => withNamedArg('--publish', (ports || []).map((port) => {
    let binding = port.hostIp ? `${port.hostIp}:` : '';
    binding += `${port.hostPort || ''}:`;
    binding += port.containerPort;
    if (port.protocol) {
        binding += `/${port.protocol}`;
    }
    return binding;
}));
const withMountsArg = (mounts?: Array<RunContainerMount>) => withNamedArg('--mount', (mounts || []).map(formatMount));
const withEnvArg = (env?: Record<string, string>) => withNamedArg('--env', Object.entries(env || {}).map(([key, value]) => `${key}=${value}`));
const withNoTruncArg = withArg('--no-trunc');
const withJsonFormatArg = withNamedArg('--format', '{{json .}}');

function parseImageRepository(repository: string): [string | undefined, string, string | undefined] {
    let index = repository.indexOf('/');

    const registry = index > -1 ? repository.substring(0, index) : undefined;
    const nameAndTag = index > -1 ? repository.substring(index + 1) : repository;

    index = nameAndTag.lastIndexOf(':');

    const name = index > -1 ? nameAndTag.substring(0, index) : nameAndTag;
    const tag = index > -1 ? nameAndTag.substring(index + 1) : undefined;

    return [registry, name, tag];
}

type DockerVersion = {
    Client: { ApiVersion: string };
    Server: { ApiVersion: string };
};

function isDockerVersion(maybeVersion: unknown): maybeVersion is DockerVersion {
    const version = maybeVersion as DockerVersion;

    if (typeof version?.Client?.ApiVersion !== 'string') {
        return false;
    }

    if (typeof version?.Server?.ApiVersion !== 'string') {
        return false;
    }

    return true;
}

type DockerListImage = {
    ID: string;
    Repository: string;
    Tag: string;
    CreatedAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isDockerListImage(maybeImage: any): maybeImage is DockerListImage {
    if (!maybeImage || typeof maybeImage !== 'object') {
        return false;
    }

    if (typeof maybeImage.ID !== 'string') {
        return false;
    }

    if (typeof maybeImage.Repository !== 'string') {
        return false;
    }

    if (typeof maybeImage.Tag !== 'string') {
        return false;
    }

    if (typeof maybeImage.CreatedAt !== 'string') {
        return false;
    }

    return true;
}

type DockerInspectImage = {
    Id: string;
    RepoTags: Array<string>;
    EnvVars: Array<string>,
    Labels: Record<string, string> | null;
    Ports: Record<string, unknown> | null,
    Volumes: Record<string, unknown> | null;
    Entrypoint: Array<string>;
    Command: Array<string>;
    CWD: string | null;
    RepoDigests: Array<string>;
    Architecture: string;
    OperatingSystem: string;
    CreatedAt: string;
    Raw: object;
};

const isDockerInspectImage = (maybeImage: unknown): maybeImage is DockerInspectImage => {
    const image = maybeImage as DockerInspectImage;

    if (!image || typeof image !== 'object') {
        return false;
    }

    if (typeof image.Id !== 'string') {
        return false;
    }

    if (!Array.isArray(image.RepoTags)) {
        return false;
    }

    if (typeof image.Labels !== 'object') {
        return false;
    }

    if (typeof image.Ports !== 'object') {
        return false;
    }

    if (typeof image.Volumes !== 'object') {
        return false;
    }

    if (image.Entrypoint !== null && !Array.isArray(image.Entrypoint)) {
        return false;
    }

    if (!Array.isArray(image.Command)) {
        return false;
    }

    if (image.CWD !== null && typeof image.CWD !== 'string') {
        return false;
    }

    if (!Array.isArray(image.RepoDigests)) {
        return false;
    }

    if (typeof image.Architecture !== 'string') {
        return false;
    }

    if (typeof image.OperatingSystem !== 'string') {
        return false;
    }

    if (typeof image.CreatedAt !== 'string') {
        return false;
    }

    if (image.Raw === null || typeof image.Raw !== 'object') {
        return false;
    }

    return true;
};

type DockerListContainer = {
    Id: string;
    Names: string;
    Image: string;
    Ports: string;
    CreatedAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isDockerListContainer = (maybeContainer: any): maybeContainer is DockerListContainer => {
    if (!maybeContainer || typeof maybeContainer !== 'object') {
        return false;
    }

    if (typeof maybeContainer.Id !== 'string') {
        return false;
    }

    if (typeof maybeContainer.Names !== 'string') {
        return false;
    }

    if (typeof maybeContainer.Image !== 'string') {
        return false;
    }

    if (typeof maybeContainer.Ports !== 'string') {
        return false;
    }

    if (typeof maybeContainer.CreatedAt !== 'string') {
        return false;
    }

    return true;
};

type DockerInspectContainerPortHost = {
    HostIp?: string;
    HostPort?: number;
};

type DockerInspectContainerBindMount = {
    Type: 'bind';
    Source: string;
    Destination: string;
    RW: boolean;
};

type DockerInspectContainerVolumeMount = {
    Type: 'volume';
    Name: string;
    Source: string;
    Destination: string;
    Driver: string;
    RW: boolean;
};

type DockerInspectContainerMount =
    | DockerInspectContainerBindMount
    | DockerInspectContainerVolumeMount;

type DockerInspectNetwork = {
    Gateway: string;
    IPAddress: string;
    MacAddress: string;
};

// TODO: Add support for networks
type DockerInspectContainer = {
    Id: string;
    Name: string;
    ImageId: string;
    ImageName: string;
    Status: string;
    Platform: string;
    Entrypoint: Array<string> | string | null;
    Command: Array<string> | string | null;
    CWD: string;
    EnvVars: Array<string> | null;
    Networks: Record<string, DockerInspectNetwork> | null;
    IP: string | null;
    Ports: Record<string, Array<DockerInspectContainerPortHost>> | null;
    PublishAllPorts: boolean;
    Mounts: Array<DockerInspectContainerMount>;
    Labels: Record<string, string> | null;
    CreatedAt: string;
    StartedAt: string;
    FinishedAt: string;
    Raw: string;
};

// TODO: Actually test properties
const isDockerInspectContainer = (maybeContainer: unknown): maybeContainer is DockerInspectContainer => {
    return true;
};

type DockerVolume = {
    Name: string;
    Driver: string;
    Labels: string;
    Mountpoint: string;
    Scope: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isDockerVolume = (maybeVolume: any): maybeVolume is DockerVolume => {
    if (!maybeVolume || typeof maybeVolume !== 'object') {
        return false;
    }

    if (typeof maybeVolume.Name !== 'string') {
        return false;
    }

    if (typeof maybeVolume.Driver !== 'string') {
        return false;
    }

    if (typeof maybeVolume.Labels !== 'string') {
        return false;
    }

    if (typeof maybeVolume.Mountpoint !== 'string') {
        return false;
    }

    if (typeof maybeVolume.Scope !== 'string') {
        return false;
    }

    return true;
};

export class DockerClient implements IContainersClient {
    readonly id = 'com.microsoft.visualstudio.containers.docker';
    readonly displayName = 'Docker';
    readonly description = 'Runs container commands using the Docker CLI';

    // Version Command

    static getVersionArgs(options?: VersionCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('version'),
            withJsonFormatArg,
        )();
    }

    async version(options?: VersionCommandOptions): Promise<CommandResponse<VersionItem>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getVersionArgs(options),
            parse: async (output, strict) => {
                const version = JSON.parse(output);
                if (!isDockerVersion(version)) {
                    throw new Error('Invalid version JSON');
                }

                return {
                    client: version.Client.ApiVersion,
                    server: version.Server.ApiVersion,
                };
            },
        };
    }

    //#region Image Commands

    static getBuildImageArgs(options: BuildImageCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'build'),
            withFlagArg('--pull', options.pull),
            withNamedArg('--file', options.file),
            withNamedArg('--target', options.stage),
            withNamedArg('--tag', options.tags),
            withNamedArg('--disable-content-trust', typeof options.disableContentTrust === 'boolean' ? options.disableContentTrust.toString() : options.disableContentTrust),
            withLabelsArg(options.labels),
            withNamedArg('--iidfile', options.imageIdFile),
            withNamedArg('--build-arg', options.args),
            withArg(quoted(options.path)),
        )();
    }

    async buildImage(options: BuildImageCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getBuildImageArgs(options),
            parse: (output, strict) => Promise.resolve(),
        };
    }

    static getListImagesArgs(options: ListImagesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'ls'),
            withFlagArg('--all', options.all),
            withNamedArg('--filter', typeof options.dangling === 'boolean' ? `dangling=${options.dangling}` : undefined),
            withNamedArg('--filter', options.references?.map((reference) => `reference=${reference}`)),
            withLabelFilterArgs(options.labels),
            withNoTruncArg,
            withJsonFormatArg,
        )();
    }

    async listImages(options: ListImagesCommandOptions): Promise<CommandResponse<Array<ListImagesItem>>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getListImagesArgs(options),
            parse: async (output, strict) => {
                const images = new Array<ListImagesItem>();
                try {
                    output.split("\n").forEach((imageJson) => {
                        try {
                            if (!imageJson) {
                                return;
                            }

                            const rawImage = JSON.parse(imageJson);

                            if (!isDockerListImage(rawImage)) {
                                throw new Error('Invalid image JSON');
                            }

                            const [registry, imageName] = parseImageRepository(rawImage.Repository);
                            const createdAt = dayjs.utc(rawImage.CreatedAt).toDate();

                            const image = registry ? `${registry}/${imageName}:${rawImage.Tag}` : `${imageName}:${rawImage.Tag}`;

                            images.push({
                                id: rawImage.ID,
                                image,
                                registry,
                                name: imageName,
                                tag: rawImage.Tag,
                                createdAt,
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

                return images;
            },
        };
    }

    static getPruneImagesArgs(options: PruneImagesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'prune'),
            withArg('--force'),
            withFlagArg('--all', options.all),
        )();
    }

    async pruneImages(options: PruneImagesCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getPruneImagesArgs(options),
            parse: (output, strict) => Promise.resolve(),
        };
    }

    static getPullImageArgs(options: PullImageCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'pull'),
            withFlagArg('--all-tags', options.allTags),
            withNamedArg('--disable-content-trust', typeof options.disableContentTrust === 'boolean' ? options.disableContentTrust.toString() : undefined),
            withArg(options.image),
        )();
    }

    async pullImage(options: PullImageCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getPullImageArgs(options),
            parse: (output, strict) => Promise.resolve(),
        };
    }

    static getTagImageArgs(options: TagImageCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'tag'),
            withArg(options.fromImage, options.toImage),
        )();
    }

    async tagImage(options: TagImageCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getTagImageArgs(options),
            parse: (output, strict) => Promise.resolve(),
        };
    }

    //#region Inspect Images

    static getInspectImagesArgs(options: InspectImagesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('image', 'inspect'),
            withNamedArg(
                '--format',
                normalizedJsonFormat<DockerInspectImage>({
                    Id: templateJson`.ID`,
                    RepoTags: templateJson`.RepoTags`,
                    EnvVars: templateJson`.Config.Env`,
                    Labels: templateJson`.Config.Labels`,
                    Ports: templateJson`.Config.ExposedPorts`,
                    Volumes: templateJson`.Config.Volumes`,
                    Entrypoint: templateJson`.Config.Entrypoint`,
                    Command: templateJson`.Config.Cmd`,
                    CWD: templateJson`.Config.WorkingDir`,
                    RepoDigests: templateJson`.RepoDigests`,
                    Architecture: templateJson`.Architecture`,
                    OperatingSystem: templateJson`.Os`,
                    CreatedAt: templateJson`.Created`,
                    Raw: templateJson`.`,
                })),
            withArg(...options.images),
        )();
    }

    static async parseInspectImagesOutput(output: string, strict: boolean): Promise<Array<InspectImagesItem>> {
        try {
            return output.split('\n').reduce<Array<InspectImagesItem>>((images, inspectString) => {
                if (!inspectString) {
                    return images;
                }

                try {
                    const inspect = JSON.parse(inspectString);

                    if (!isDockerInspectImage(inspect)) {
                        throw new Error('Invalid image inspect json');
                    }

                    // TODO: firstOrDefault helper util
                    const [registry, imageName, tagName] = inspect.RepoTags
                        .slice(0, 1)
                        .reduce<[string | undefined, string | undefined, string | undefined]>((unused, repoTag) => {
                            return parseImageRepository(repoTag);
                        }, [undefined, undefined, undefined]);

                    const fullImage = imageName ? registry ? `${registry}/${imageName}:${tagName}` : `${imageName}:${tagName}` : undefined;
                    const environmentVariables = (inspect.EnvVars || []).reduce<Record<string, string>>((evs, ev) => {
                        const index = ev.indexOf('=');
                        if (index > -1) {
                            const name = ev.slice(0, index);
                            const value = ev.slice(index + 1);

                            return {
                                ...evs,
                                [name]: value,
                            };
                        }

                        return evs;
                    }, {});
                    const ports = Object.entries(inspect.Ports || {}).map<PortBinding>(([rawPort]) => {
                        const [port, protocol] = rawPort.split('/');
                        return {
                            containerPort: parseInt(port),
                            protocol: protocol.toLowerCase() === 'tcp' ? 'tcp' : protocol.toLowerCase() === 'udp' ? 'udp' : undefined,
                        };
                    });
                    const volumes = Object.entries(inspect.Volumes || {}).map<string>(([rawVolume]) => rawVolume);
                    const labels = inspect.Labels ?? {};
                    const architecture = inspect.Architecture.toLowerCase() === 'amd64' ? 'amd64' : inspect.Architecture.toLowerCase() === 'arm64' ? 'arm64' : undefined;
                    const os = inspect.OperatingSystem.toLowerCase() === 'linux' ? 'linux' : inspect.Architecture.toLowerCase() === 'windows' ? 'windows' : undefined;
                    // Determine if the image has been pushed to a remote repo (no repo digests or only localhost/ repo digetss)
                    const isLocalImage = !(inspect.RepoDigests || []).some((digest) => !digest.toLowerCase().startsWith('localhost/'));

                    const image: InspectImagesItem = {
                        id: inspect.Id,
                        name: imageName,
                        tag: tagName,
                        registry: registry,
                        image: fullImage,
                        isLocalImage,
                        environmentVariables,
                        ports,
                        volumes,
                        labels,
                        entrypoint: inspect.Entrypoint,
                        command: inspect.Command,
                        currentDirectory: inspect.CWD || undefined,
                        architecture,
                        operatingSystem: os,
                        createdAt: dayjs.utc(inspect.CreatedAt).toDate(),
                        raw: JSON.stringify(inspect.Raw),
                    };

                    return [...images, image];
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }

                return images;
            }, new Array<InspectImagesItem>());
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return new Array<InspectImagesItem>();
    }

    async inspectImages(options: InspectImagesCommandOptions): Promise<CommandResponse<Array<InspectImagesItem>>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getInspectImagesArgs(options),
            parse: DockerClient.parseInspectImagesOutput,
        };
    }

    //#endregion

    //#endregion

    //#region Container Commands

    static getRunContainerArgs(options: RunContainerCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'run'),
            withFlagArg('--detach', options.detached),
            withFlagArg('--tty', options.detached),
            withFlagArg('--rm', options.removeOnExit),
            withNamedArg('--name', options.name),
            withPortsArg(options.ports),
            withFlagArg('--publish-all', options.publishAllPorts),
            withMountsArg(options.mounts),
            withLabelsArg(options.labels),
            withEnvArg(options.environmentVariables),
            withNamedArg('--entrypoint', options.entrypoint),
            withArg(options.image),
            withArg(...(toArray(options.command || []))),
        )();
    }

    async runContainer(options: RunContainerCommandOptions): Promise<CommandResponse<string | undefined>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getRunContainerArgs(options),
            parse: async (output, strict) => options.detached ? output.split('\n', 1)[0] : output,
        };
    }

    static getExecContainerArgs(options: ExecContainerCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'exec'),
            withFlagArg('--interactive', options.interactive),
            withFlagArg('--detached', options.detached),
            withFlagArg('--tty', options.tty),
            withEnvArg(options.environmentVariables),
            withArg(options.container),
            withArg(...toArray(options.command)),
        )();
    }

    async execContainer(options: ExecContainerCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getExecContainerArgs(options),
            parse: (output, strict) => Promise.resolve(),
        };
    }

    static getListContainersArgs(options: ListContainersCommandOptions, overrides?: Partial<JsonFormatOptions<DockerListContainer>>): CommandLineArgs {
        return composeArgs(
            withArg('container', 'ls'),
            withFlagArg('--all', options.all),
            withLabelFilterArgs(options.labels),
            withNamedArg('--filter', options.running ? 'status=running' : undefined),
            withNamedArg('--filter', options.exited ? 'status=exited' : undefined),
            withNamedArg('--filter', options.names?.map((name) => `name=${name}`)),
            withNoTruncArg,
            withNamedArg(
                '--format',
                normalizedJsonFormat<DockerListContainer>({
                    Id: templateJson`.ID`,
                    Names: templateJson`.Names`,
                    Image: templateJson`.Image`,
                    Ports: templateJson`.Ports`,
                    CreatedAt: templateJson`.CreatedAt`
                }, overrides)),
        )();
    }

    static parseRawPortString(portString: string): PortBinding | undefined {
        const [hostInfo, rawContainerPort, protocol] = portString.split(/->|\//);

        if (protocol !== 'tcp' && protocol !== 'udp') {
            return;
        }

        const containerPort = parseInt(rawContainerPort);
        if (containerPort <= 0) {
            return;
        }

        const hostPortIndex = hostInfo.lastIndexOf(':');
        const hostIp = hostInfo.slice(0, hostPortIndex);
        const rawHostPort = hostInfo.slice(hostPortIndex + 1);

        const hostPort = parseInt(rawHostPort);
        if (hostPort <= 0) {
            return;
        }

        return {
            hostIp: hostIp,
            containerPort: containerPort,
            hostPort: hostPort,
            protocol,
        };
    }

    static async parseListContainersOutput(output: string, strict: boolean): Promise<Array<ListContainersItem>> {
        const containers = new Array<ListContainersItem>();
        try {
            output.split('\n').forEach((containerJson) => {
                try {
                    if (!containerJson) {
                        return;
                    }

                    const rawContainer = JSON.parse(containerJson);

                    if (!isDockerListContainer(rawContainer)) {
                        throw new Error('Invalid container JSON');
                    }

                    const ports = rawContainer.Ports
                        .split(',')
                        .map((port) => port.trim())
                        .filter((port) => !!port)
                        .reduce<Array<PortBinding>>((portBindings, rawPort) => {
                            const parsedPort = DockerClient.parseRawPortString(rawPort);
                            if (parsedPort) {
                                return portBindings.concat(parsedPort);
                            } else if (strict) {
                                throw new Error('Invalid container JSON');
                            } else {
                                return portBindings;
                            }
                        }, []);

                    const name = rawContainer.Names.split(',')[0].trim();
                    const createdAt = dayjs.utc(rawContainer.CreatedAt, DOCKER_LIST_DATE_FORMAT).toDate();

                    containers.push({
                        id: rawContainer.Id,
                        name,
                        image: rawContainer.Image,
                        ports,
                        createdAt,
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

        return containers;
    }

    async listContainers(options: ListContainersCommandOptions): Promise<CommandResponse<Array<ListContainersItem>>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getListContainersArgs(options),
            parse: DockerClient.parseListContainersOutput,
        };
    }

    static getStopContainersArgs(options: StopContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'stop'),
            withNamedArg('--time', typeof options.time === 'number' ? options.time.toString() : undefined),
            withArg(...toArray(options.container)),
        )();
    }

    async stopContainers(options: StopContainersCommandOptions): Promise<CommandResponse<Array<string>>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getStopContainersArgs(options),
            parse: async (output, strict) => {
                return output.split('\n').filter((id) => id);
            },
        };
    }

    static getRemoveContainersArgs(options: RemoveContainersCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('container', 'rm'),
            withFlagArg('--force', options.force),
            withArg(...options.containers),
        )();
    }

    async removeContainers(options: RemoveContainersCommandOptions): Promise<CommandResponse<Array<string>>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getRemoveContainersArgs(options),
            parse: async (output, strict) => {
                return output.split('\n').filter((id) => id);
            },
        };
    }

    static getLogsForContainerArgs(options: LogsForContainerCommandOptions): CommandLineArgs {
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

    async logsForContainer(options: LogsForContainerCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getLogsForContainerArgs(options),
            parse: (output, string) => Promise.resolve(),
        };
    }

    static getInspectContainersArgs(options: InspectContainersCommandOptions, formatOverrides?: Partial<JsonFormatOptions<DockerInspectContainer>>): CommandLineArgs {
        return composeArgs(
            withArg('container', 'inspect'),
            withNamedArg(
                '--format',
                normalizedJsonFormat<DockerInspectContainer>({
                    Id: templateJson`.ID`,
                    Name: templateJson`.Name`,
                    ImageId: templateJson`.Image`,
                    ImageName: templateJson`.Config.Image`,
                    Status: templateJson`.State.Status`,
                    Platform: templateJson`.Platform`,
                    EnvVars: templateJson`.Config.Env`,
                    Networks: templateJson`.NetworkSettings.Networks`,
                    IP: templateJson`.NetworkSettings.IPAddress`,
                    Ports: templateJson`.NetworkSettings.Ports`,
                    PublishAllPorts: templateJson`.HostConfig.PublishAllPorts`,
                    Mounts: templateJson`.Mounts`,
                    Labels: templateJson`.Config.Labels`,
                    Entrypoint: templateJson`.Config.Entrypoint`,
                    Command: templateJson`.Config.Cmd`,
                    CWD: templateJson`.Config.WorkingDir`,
                    CreatedAt: templateJson`.Created`,
                    StartedAt: templateJson`.State.StartedAt`,
                    FinishedAt: templateJson`.State.FinishedAt`,
                    Raw: templateJson`.`,
                }, formatOverrides),
            ),
            withArg(...options.containers)
        )();
    }

    static async parseInspectContainersOutput(output: string, strict: boolean): Promise<Array<InspectContainersItem>> {
        try {
            return output.split('\n').reduce<Array<InspectContainersItem>>((containers, inspectString) => {
                if (!inspectString) {
                    return containers;
                }

                try {
                    const inspect = JSON.parse(inspectString);

                    if (!isDockerInspectContainer(inspect)) {
                        throw new Error('Invalid container inspect json');
                    }

                    const environmentVariables = (inspect.EnvVars || []).reduce<Record<string, string>>((evs, ev) => {
                        const index = ev.indexOf('=');
                        if (index > -1) {
                            const name = ev.slice(0, index);
                            const value = ev.slice(index + 1);

                            return {
                                ...evs,
                                [name]: value,
                            };
                        }

                        return evs;
                    }, {});

                    const networks = Object.entries(inspect.Networks || {}).map<InspectContainersItemNetwork>(([name, dockerNetwork]) => {
                        return {
                            name,
                            gateway: dockerNetwork.Gateway || undefined,
                            ipAddress: dockerNetwork.IPAddress || undefined,
                            macAddress: dockerNetwork.MacAddress || undefined,
                        };
                    });

                    const ports = Object.entries(inspect.Ports || {}).map<PortBinding>(([rawPort]) => {
                        const [port, protocol] = rawPort.split('/');
                        return {
                            containerPort: parseInt(port),
                            protocol: protocol.toLowerCase() === 'tcp' ? 'tcp' : protocol.toLowerCase() === 'udp' ? 'udp' : undefined,
                        };
                    });

                    const mounts = (inspect.Mounts || []).reduce<Array<InspectContainersItemMount>>((curMounts, mount) => {
                        switch (mount?.Type) {
                            case 'bind':
                                return [...curMounts, {
                                    type: 'bind',
                                    source: mount.Source,
                                    destination: mount.Destination,
                                    readOnly: !mount.RW,
                                }];
                            case 'volume':
                                return [...curMounts, {
                                    type: 'volume',
                                    name: mount.Name,
                                    source: mount.Source,
                                    destination: mount.Destination,
                                    driver: mount.Driver,
                                    readOnly: !mount.RW,
                                }];
                        }

                        return curMounts;
                    }, new Array<InspectContainersItemMount>());
                    const labels = inspect.Labels ?? {};

                    const createdAt = dayjs.utc(inspect.CreatedAt);
                    const startedAt = inspect.StartedAt ? dayjs.utc(inspect.StartedAt) : undefined;
                    const finishedAt = inspect.FinishedAt ? dayjs.utc(inspect.FinishedAt) : undefined;

                    const container: InspectContainersItem = {
                        id: inspect.Id,
                        name: inspect.Name,
                        imageId: inspect.ImageId,
                        imageName: inspect.ImageName,
                        status: inspect.Status,
                        environmentVariables,
                        networks,
                        ipAddress: inspect.IP ? inspect.IP : undefined,
                        ports,
                        mounts,
                        labels,
                        entrypoint: toArray(inspect.Entrypoint ?? []),
                        command: toArray(inspect.Command ?? []),
                        currentDirectory: inspect.CWD || undefined,
                        createdAt: createdAt.toDate(),
                        startedAt: startedAt && (startedAt.isSame(createdAt) || startedAt.isAfter(createdAt)) ? startedAt.toDate() : undefined,
                        finishedAt: finishedAt && (finishedAt.isSame(createdAt) || finishedAt.isAfter(createdAt)) ? finishedAt.toDate() : undefined,
                        raw: JSON.stringify(inspect.Raw),
                    };

                    return [...containers, container];
                } catch (err) {
                    if (strict) {
                        throw err;
                    }
                }

                return containers;
            }, new Array<InspectContainersItem>());
        } catch (err) {
            if (strict) {
                throw err;
            }
        }

        return new Array<InspectContainersItem>();
    }

    async inspectContainers(options: InspectContainersCommandOptions): Promise<CommandResponse<InspectContainersItem[]>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getInspectContainersArgs(options),
            parse: DockerClient.parseInspectContainersOutput,
        };
    }

    //#endregion

    // Volume Commands

    static getCreateVolumeArgs(options: CreateVolumeCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'create'),
            withNamedArg('--driver', options.driver),
            withArg(options.name),
            withJsonFormatArg,
        )();
    }

    async createVolume(options: CreateVolumeCommandOptions): Promise<CommandResponse<void>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getCreateVolumeArgs(options),
            parse: (output, string) => Promise.resolve(),
        };
    }

    static getListVolumesArgs(options: ListVolumesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'ls'),
            withNamedArg('--filter', typeof options.dangling === 'boolean' ? `dangling=${options.dangling}` : undefined),
            withNamedArg('--filter', options.driver ? `driver=${options.driver}` : undefined),
            withLabelFilterArgs(options.labels),
            withJsonFormatArg,
        )();
    }

    async listVolumes(options: ListVolumesCommandOptions): Promise<CommandResponse<ListVolumeItem[]>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getListVolumesArgs(options),
            parse: async (output, strict) => {
                const volumes = new Array<ListVolumeItem>();
                try {
                    output.split("\n").forEach((volumeJson) => {
                        try {
                            if (!volumeJson) {
                                return;
                            }

                            const rawVolume = JSON.parse(volumeJson);

                            if (!isDockerVolume(rawVolume)) {
                                throw new Error('Invalid volume JSON');
                            }

                            const labels = rawVolume.Labels.split(',').reduce((labels, labelPair) => {
                                const index = labelPair.indexOf('=');
                                labels[labelPair.substring(0, index)] = labelPair.substring(index + 1);
                                return labels;
                            }, {} as Labels);

                            volumes.push({
                                name: rawVolume.Name,
                                driver: rawVolume.Driver,
                                labels,
                                mountpoint: rawVolume.Mountpoint,
                                scope: rawVolume.Scope,
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

                return volumes;
            },
        };
    }

    static getRemoveVolumesArgs(options: RemoveVolumesCommandOptions): CommandLineArgs {
        return composeArgs(
            withArg('volume', 'rm'),
            withFlagArg('--force', options.force),
            withArg(...options.volumes),
        )();
    }

    async removeVolumes(options: RemoveVolumesCommandOptions): Promise<CommandResponse<string[]>> {
        return {
            command: DOCKER_COMMAND,
            args: DockerClient.getRemoveVolumesArgs(options),
            parse: async (output, strict) => {
                return output.split('\n').filter(id => id);
            },
        };
    }
}
