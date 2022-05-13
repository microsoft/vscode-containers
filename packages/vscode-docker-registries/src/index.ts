/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Interface the Docker extension implements
export { DockerExtension } from "./contracts/DockerExtension";

// Interface of a registry provider
export { DockerRegistryProviderBase, BasicDockerRegistryProvider, CustomDockerRegistryProvider } from "./contracts/DockerRegistryProvider";
export { DockerRegistry } from "./contracts/DockerRegistry";
export { DockerRepository } from "./contracts/DockerRepository";
export { DockerTag } from "./contracts/DockerTag";
export { ParentTreeItem } from "./contracts/ParentTreeItem";
export { RegistryTreeItem } from "./contracts/RegistryTreeItem";

// Other interfaces
export { CommandContext } from "./contracts/CommandContext";
export { DockerCredentials } from "./contracts/DockerCredentials";

// Generic caching provider implementation and utilities
export { CachingRegistryProviderBase } from "./CachingProvider/CachingRegistryProviderBase";
export { CachingRegistryBase } from "./CachingProvider/CachingRegistryBase";
export { CachingRepositoryBase } from "./CachingProvider/CachingRepositoryBase";

// Generic V2 registry implementation and utilities
export { RegistryV2ProviderBase } from "./RegistryV2Provider/RegistryV2ProviderBase";
export { RegistryV2 } from "./RegistryV2Provider/RegistryV2";
export { RepositoryV2 } from "./RegistryV2Provider/RepositoryV2";
export { TagV2 } from "./RegistryV2Provider/TagV2";
export { asCancellable, CancelError } from "./RegistryV2Provider/utils/asCancellable";
export { registryV2Request, AuthContext } from "./RegistryV2Provider/utils/registryV2Request";
export * from './RegistryV2Provider/utils/RegistryV2Responses';
