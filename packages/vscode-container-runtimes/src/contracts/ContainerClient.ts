/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { CommandLineArgs } from "../utils/commandLineBuilder";

export type CommandResponse<T> = {
    command: string;
    args: CommandLineArgs;
    parse: (output: string, strict: boolean) => Promise<T>;
};

export type Labels = {
    [key: string]: string;
};

export type LabelFilters = {
    [key: string]: string | boolean;
};

// Client Identity Types

export type ClientIdentity = {
    readonly id: string;
    readonly displayName: string;
    readonly description: string;
};

// Version Command Types

export type VersionCommandOptions = unknown;

export type VersionItem = {
    client: string;
    server?: string;
};

export type VersionCommand = {
    version(options?: VersionCommandOptions): Promise<CommandResponse<VersionItem>>;
};

//#region Image Commands

// Build Image Command Types

export type BuildImageCommandOptions = {
    path: string;
    file?: string;
    stage?: string;
    tags?: Array<string> | string;
    pull?: boolean;
    disableContentTrust?: boolean;
    labels?: Labels;
    args?: Array<string>;
    imageIdFile?: string;
};

type BuildImageCommand = {
    buildImage(options: BuildImageCommandOptions): Promise<CommandResponse<void>>;
};

// List Images Command Types

export type ListImagesCommandOptions = {
    all?: boolean;
    dangling?: boolean;
    labels?: LabelFilters;
    references?: Array<string>;
};

export type ListImagesItem = {
    id: string;
    name: string;
    tag: string;
    image: string;
    createdAt: Date;
    registry?: string;
};

type ListImagesCommand = {
    listImages(options: ListImagesCommandOptions): Promise<CommandResponse<Array<ListImagesItem>>>;
};

// Prune Images Command Types

export type PruneImagesCommandOptions = {
    all?: boolean;
};

type PruneImagesCommand = {
    pruneImages(options: PruneImagesCommandOptions): Promise<CommandResponse<void>>;
};

// Pull Image Command Types

export type PullImageCommandOptions = {
    image: string;
    allTags?: boolean;
    disableContentTrust?: boolean;
};

type PullImageCommand = {
    pullImage(options: PullImageCommandOptions): Promise<CommandResponse<void>>;
};

// Tag Image Command Types

export type TagImageCommandOptions = {
    fromImage: string;
    toImage: string;
};

type TagImageCommand = {
    tagImage(options: TagImageCommandOptions): Promise<CommandResponse<void>>;
};

// Inspect Image Command Types

export type InspectImagesItem = {
    id: string;
    name?: string; // the core name of the image
    tag?: string; // the tag of the image
    registry?: string; // the registry the image belongs to
    image?: string; // <registry>/<name>:<tag> or <name>:<tag> if no registry
    isLocalImage: boolean; // no remote registry digests
    environmentVariables: Record<string, string>;
    ports: Array<PortBinding>;
    volumes: Array<string>;
    labels: Record<string, string>;
    entrypoint: Array<string>;
    command: Array<string>;
    currentDirectory?: string;
    architecture?: "amd64" | "arm64";
    operatingSystem?: "linux" | "windows";
    createdAt: Date;
    raw: string;
};

export type InspectImagesCommandOptions = {
    images: Array<string>;
};

type InspectImagesCommand = {
    inspectImages(options: InspectImagesCommandOptions): Promise<CommandResponse<Array<InspectImagesItem>>>;
};

//#endregion

// Run Container Command Types

export type PortBinding = {
    containerPort: number;
    hostPort?: number;
    hostIp?: string;
    protocol?: 'udp' | 'tcp';
};

export type RunContainerBindMount = {
    type: 'bind';
    source: string;
    destination: string;
    readOnly: boolean;
};

export type RunContainerVolumeMount = {
    type: 'volume';
    source: string;
    destination: string;
    readOnly: boolean;
};

export type RunContainerMount =
| RunContainerBindMount
| RunContainerVolumeMount;

export type RunContainerCommandOptions = {
    image: string;
    name?: string;
    detached?: boolean;
    removeOnExit?: boolean;
    labels?: Labels;
    ports?: Array<PortBinding>;
    publishAllPorts?: boolean;
    mounts?: Array<RunContainerMount>;
    environmentVariables?: Record<string, string>;
    pull?: "always" | "missing" | "never";
    entrypoint?: string;
    command?: Array<string> | string;
};

type RunContainerCommand = {
    runContainer(options: RunContainerCommandOptions): Promise<CommandResponse<string | undefined>>;
};

// Exec Container Command Types

export type ExecContainerCommandOptions = {
    container: string;
    interactive?: boolean;
    detached?: boolean;
    tty?: boolean;
    environmentVariables?: Record<string, string>;
    command: Array<string> | string;
};

type ExecContainerCommand = {
    execContainer(options: ExecContainerCommandOptions): Promise<CommandResponse<void>>;
};

// List Containers Command Types

export type ListContainersCommandOptions = {
    all?: boolean;
    running?: boolean;
    exited?: boolean;
    labels?: LabelFilters;
    names?: Array<string>;
};

export type ListContainersItem = {
    id: string;
    name: string;
    image: string;
    ports: Array<PortBinding>;
    createdAt: Date;
};

type ListContainersCommand = {
    listContainers(options: ListContainersCommandOptions): Promise<CommandResponse<Array<ListContainersItem>>>;
};

// Stop Containers Command Types

export type StopContainersCommandOptions = {
    container: Array<string>;
    time?: number;
};

type StopContainersCommand = {
    stopContainers(options: StopContainersCommandOptions): Promise<CommandResponse<Array<string>>>;
};

// Remove Containers Command Types

export type RemoveContainersCommandOptions = {
    containers: Array<string>;
    force?: boolean;
};

type RemoveContainersCommand = {
    removeContainers(options: RemoveContainersCommandOptions): Promise<CommandResponse<Array<string>>>;
};

// Logs For Container Command Types

export type LogsForContainerCommandOptions = {
    container: string;
    follow?: boolean;
    tail?: number;
    since?: string;
    until?: string;
    timestamps?: boolean;
};

type LogsForContainerCommand = {
    logsForContainer(options: LogsForContainerCommandOptions): Promise<CommandResponse<void>>;
};

// Inspect Container Command Types

export type InspectContainersCommandOptions = {
    containers: Array<string>;
};

export type InspectContainersItemBindMount = {
    type: 'bind';
    source: string;
    destination: string;
    readOnly: boolean;
};

export type InspectContainersItemVolumeMount = {
    type: 'volume';
    source: string;
    destination: string;
    driver?: string;
    readOnly: boolean;
};

export type InspectContainersItemMount =
| InspectContainersItemBindMount
| InspectContainersItemVolumeMount;

export type InspectContainersItemNetwork = {
    name: string;
    gateway?: string;
    ipAddress?: string;
    macAddress?: string;
};

export type InspectContainersItem = {
    id: string;
    name: string; // container name
    imageId: string;
    imageName: string;
    status?: string;
    environmentVariables: Record<string, string>;
    networks: Array<InspectContainersItemNetwork>;
    ipAddress?: string;
    ports: Array<PortBinding>;
    mounts: Array<InspectContainersItemMount>;
    labels: Record<string, string>;
    entrypoint: Array<string>;
    command: Array<string>;
    currentDirectory?: string;
    createdAt: Date;
    startedAt?: Date;
    finishedAt?: Date;
    raw: string;
};

type InspectContainersCommand = {
    inspectContainers(options: InspectContainersCommandOptions): Promise<CommandResponse<Array<InspectContainersItem>>>;
};

// Create Volume Command Types

export type CreateVolumeCommandOptions = {
    name: string;
    driver?: string;
};

type CreateVolumeCommand = {
    createVolume(options: CreateVolumeCommandOptions): Promise<CommandResponse<void>>;
};

// List Volumes Command Types

export type ListVolumesCommandOptions = {
    labels?: LabelFilters;
    dangling?: boolean;
    driver?: string;
};

export type ListVolumeItem = {
    name: string;
    driver: string;
    labels: Labels;
    mountpoint: string;
    scope: string;
};

type ListVolumesCommand = {
    listVolumes(options: ListVolumesCommandOptions): Promise<CommandResponse<Array<ListVolumeItem>>>;
};

// Remove Volumes Command Types

export type RemoveVolumesCommandOptions = {
    volumes: Array<string>;
    force?: boolean;
};

type RemoveVolumesCommand = {
    removeVolumes(options: RemoveVolumesCommandOptions): Promise<CommandResponse<Array<string>>>;
};

export interface IContainersClient extends
    ClientIdentity,
    VersionCommand,
    // Image Commands
    BuildImageCommand,
    ListImagesCommand,
    PruneImagesCommand,
    PullImageCommand,
    TagImageCommand,
    InspectImagesCommand,
    // Container Commands
    RunContainerCommand,
    ExecContainerCommand,
    ListContainersCommand,
    StopContainersCommand,
    RemoveContainersCommand,
    LogsForContainerCommand,
    InspectContainersCommand,
    // Volume Commands
    CreateVolumeCommand,
    ListVolumesCommand,
    RemoveVolumesCommand { }

const clients = new Map<string, IContainersClient>();

export function registerClient(name: string, client: IContainersClient): boolean {
    if (name && client && !clients.has(name)) {
        clients.set(name, client);
        return true;
    }

    return false;
}

export function getClients(): Map<string, IContainersClient> {
    return clients;
}