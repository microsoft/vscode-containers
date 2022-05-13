# Docker Registry Provider Extensibility Model

## Motivation
Several concerns around registry providers have motivated us to explore a better extensibility model for supplying additional providers. These include:

1. Scalability--we can't scale to implement and maintain a multitude of different registry providers
1. Openness--we don't want to be the arbiters of which registries get implemented and shown

In order to alleviate these concerns it is necessary to establish a better extensibility model.

## Overview

Adding a registry provider would involve creating an extension, which can communicate with the Docker extension to provide a view into a given registry. Optionally, the extension could also implement context and palette commands. With the correct context values on nodes, the existing context and palette commands will also work. These commands include:
- `vscode-docker.registries.copyImageDigest`
- `vscode-docker.registries.deleteImage`
- `vscode-docker.registries.disconnectRegistry`
- `vscode-docker.registries.logInToDockerCli`
- `vscode-docker.registries.logOutOfDockerCli`
- `vscode-docker.registries.pullImage`
- `vscode-docker.registries.pullRepository`
- `vscode-docker.registries.reconnectRegistry`
- `vscode-docker.images.push` (indirectly, this depends on `DockerRegistry.baseImagePath`)

// TODO: this feels out of place in the Overview section

// TODO: List the right context values in source

A Node package (`vscode-docker-registries`) contains the interfaces necessary to properly implement the provider, and also includes a generic V2 provider, since _most_ providers would be little more than a slim inheriting implementation on top of that.

## Implementing a registry provider
In order to connect to a given registry, the provider author must write the necessary code to authenticate and query their offering, and implement the necessary provider interfaces (alluded to above and described in detail below).

There are two ways to do this:

### 1. Strict registry structure
An extension implements three primary methods (and some additional supporting methods):
1. Get the list of registries (or just one if it's a public registry)
1. For each registry, get the list of repositories
1. For each repository, get the list of tags

Implementing a registry provider this way is very simple, but additional features (like ACR's subscriptions, tasks) are not possible.

### 2. Show arbitrary tree structure
An extension gives a tree object which will show anything they wish. It is more difficult to implement but offers greater flexibility.

## Registering a registry provider
The Docker extension implements an interface (see below) allowing for registry providers to register themselves with the extension. The extensions need to call this registration method every time the Docker extension is activated, and can accomplish this by setting an activation event on the command `vscode-docker.registries.providerActivation`. In `package.json`:
```json
{
    ...
    "activationEvents": [
        "onCommand:vscode-docker.registries.providerActivation",
        ...
    ]
    ...
}
```

Upon activation, the provider extension must call the Docker extension to register. The `registerDockerRegistryProvider` method returns a `Disposable` which should be pushed to the extension activation context's subscriptions.

```ts
export function activate(ctx: vscode.ExtensionContext): void {
    const provider = new MyDockerRegistryProvider();
    const dockerExtension = vscode.extensions.getExtension<DockerExtension>('ms-azuretools.vscode-docker');
    ctx.subscriptions.push(dockerExtension.registerDockerRegistryProvider(provider));
}
```

## Showing up in the provider pick list
In order to be used, an extension needs to show up in the quick pick list for registry providers. The list will consist of:

1. All providers for which the prerequisite(s) are installed (which would always include Docker Hub and the generic V2 provider), _and_ that have registered themselves at runtime with the Docker extension.
1. A manifest maintained in the Docker Extension repo will keep a list of known provider IDs, names, and dependent extensions. We will accept contributions to this manifest, with reasonable criteria such as:
    - We will spend at least a bit of time up front inspecting their source code for obvious problems
    - Their provider must be open-source
    - Their provider must not be redundant with existing ones
    - It's rather subjective, but their provider must appear like a serious effort that will be maintained in the future; not a passing side project

Optionally, the Docker extension may also establish a tag that can be used by provider extensions to easily filter for them on the marketplace, and a link/command/etc. within the Docker extension to open the marketplace with that filter.

## Interfaces

### Docker extension

`DockerExtension`:
```ts
// src/contracts/DockerExtension.ts#L9-L20

/**
 * Interface implemented by the Docker extension.
 * @example const dockerExtension = vscode.extensions.getExtension<DockerExtension>('ms-azuretools.vscode-docker').exports;
 */
export interface DockerExtension {
    /**
     * Registers a registry provider with the Docker extension
     * @param provider The provider to register with the extension
     * @returns A disposable that, when disposed, will un-register the provider
     */
    registerDockerRegistryProvider(provider: BasicDockerRegistryProvider | CustomDockerRegistryProvider): Disposable;
}
```
Note: "register...Registry" is a bit of a tongue twister, but all of the VSCode API's similar methods use "register*"; consistency is good.

### Basic registry provider

`RegistryTreeItem`:
```ts
// src/contracts/RegistryTreeItem.ts#L8-L50

/**
 * Interface for all nodes that appear in the Docker extension's explorer view for registries.
 * This is mostly-identical to `vscode.TreeItem` but intentionally does not extend it--`RegistryTreeItem` objects
 * created by the provider will not be directly used to build the tree in the VS Code UI, nor will they be passed
 * as context when commands are invoked. Instead, the properties below will be copied into a new object. Any
 * additional properties will not be copied.
 */
export interface RegistryTreeItem {
    /**
     * The label for the node
     */
    readonly label: string;

    /**
     * The context value for the node. In order to use the existing commands for registries in the Docker extension, this must contain // TODO
     */
    readonly contextValue: string;

    /**
     * The ID for the node. Optional. This is not the same as `providerId` / `registryId`.
     */
    readonly id?: string;

    /**
     * The icon for the node
     */
    readonly iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;

    /**
     * The description for the node (rendered less prominently than the label)
     */
    readonly description?: string | boolean;

    /**
     * The tooltip for the node
     */
    readonly tooltip?: string;

    /**
     * The command to run when the node is left-clicked
     */
    readonly command?: Command;
}
```

`DockerRegistryProviderBase`:
```ts
// src/contracts/DockerRegistryProvider.ts#L11-L30

/**
 * Base interface for registry providers
 */
export interface DockerRegistryProviderBase extends RegistryTreeItem {
    /**
     * The registry provider ID. Must be universally unique and consisting only of alphanumeric characters.
     */
    readonly providerId: string;

    /**
     * Connects a registry. UI prompts should be implemented to gather the necessary information to connect. This method is optional if a provider can determine all the necessary information on its own without prompts.
     * @param token Cancellation token
     */
    connectRegistry?(token: CancellationToken): Promise<DockerRegistry>;

    /**
     * Disconnects a registry
     */
    disconnectRegistry?(registry: DockerRegistry): Promise<void>;
}
```

`BasicDockerRegistryProvider`:
```ts
// src/contracts/DockerRegistryProvider.ts#L32-L42

/**
 * Interface for a basic registry provider that implements `getRegistries`, to provide a set of registries, repositories, and tags
 */
export interface BasicDockerRegistryProvider extends DockerRegistryProviderBase {
    /**
     * Gets the registries for this provider
     * @param refresh If true, a refresh is being done, and caching should not be used
     * @param token Cancellation token
     */
    getRegistries(refresh: boolean, token: CancellationToken): Promise<DockerRegistry[]>;
}
```

`DockerRegistry`:
```ts
// src/contracts/DockerRegistry.ts#L11-L37

/**
 * Interface for a Docker registry. A registry contains a set of repositories.
 */
export interface DockerRegistry extends RegistryTreeItem {
    /**
     * The base image path, prepended to the image name when pushing.
     */
    readonly baseImagePath: string;

    /**
     * The registry ID. Must be unique within the registry provider, and consisting only of alphanumeric characters.
     */
    readonly registryId: string;

    /**
     * Gets the repositories that are contained in this registry.
     * @param refresh If true, a refresh is being done, and caching should not be used
     * @param token Cancellation token
     */
    getRepositories(refresh: boolean, token: CancellationToken): Promise<DockerRepository[]>;

    /**
     * Gets the login credentials for this registry
     * @param token Cancellation token
     */
    getDockerLoginCredentials?(token: CancellationToken): Promise<DockerCredentials>;
}
```

`DockerRepository`:
```ts
// src/contracts/DockerRepository.ts#L10-L26

/**
 * Interface for a Docker repository
 */
export interface DockerRepository extends RegistryTreeItem {
    /**
     * Gets all the tags for this repository.
     * @param refresh If true, a refresh is being done, and caching should not be used
     * @param token Cancellation token
     */
    getTags(refresh: boolean, token: CancellationToken): Promise<DockerTag[]>;

    /**
     * Deletes a repository. This method is optional.
     * @param token Cancellation token
     */
    delete?(token: CancellationToken): Promise<void>;
}
```

`DockerTag`:
```ts
// src/contracts/DockerTag.ts#L9-L18

/**
 * Interface for a Docker tag
 */
export interface DockerTag extends RegistryTreeItem {
    /**
     * Deletes a tag. This method is optional.
     * @param token Cancellation token
     */
    delete?(token: CancellationToken): Promise<void>;
}
```

### Custom registry provider

`CustomDockerRegistryProvider`:
```ts
// src/contracts/DockerRegistryProvider.ts#L44-L48

/**
 * Interface for a custom registry provider that implements `getChildTreeItems`, to provide an arbitrary tree of nodes
 */
export interface CustomDockerRegistryProvider extends DockerRegistryProviderBase, ParentTreeItem {
}
```

`ParentTreeItem`:
```ts
// src/contracts/ParentTreeItem.ts#L9-L19

/**
 * Interface for a `RegistryTreeItem` with children. Part of the `CustomDockerRegistryProvider` implementation.
 */
export interface ParentTreeItem extends RegistryTreeItem {
    /**
     * Gets the child items for this tree node
     * @param refresh If true, a refresh is being done, and caching should not be used
     * @param token Cancellation token
     */
    getChildTreeItems(refresh: boolean, token: CancellationToken): Promise<RegistryTreeItem[]>;
}
```

### Others

`DockerCredentials`:
```ts
// src/contracts/DockerCredentials.ts#L6-L24

/**
 * Interface for Docker credentials, used for `docker login` commands and authenticating to registries.
 */
export interface DockerCredentials {
    /**
     * The service the credentials are for
     */
    readonly service: string;

    /**
     * The username / account name
     */
    readonly account: string;

    /**
     * The secret (password, personal access token, etc.)
     */
    readonly secret: string;
}
```

`CommandContext`:
```ts
// src/contracts/CommandContext.ts#L8-L20

/**
 * When context/palette commands are called on nodes, the command will be given arguments
 * in the form of: `CommandContext?`, `CommandContext[]?` (standard VSCode behavior)
 *
 * The first is the right-clicked node, and the second is the list of selected nodes
 * if multi-select is enabled
 */
export interface CommandContext {
    /**
     * The original `RegistryTreeItem` used to create this tree node
     */
    readonly originalRegistryTreeItem: RegistryTreeItem;
}
```
