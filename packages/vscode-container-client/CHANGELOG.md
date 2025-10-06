## 0.5.0 - 6 October 2025
### Added
* Package is now a combined CJS+ESM package, instead of just CJS. [#297](https://github.com/microsoft/vscode-docker-extensibility/pull/297)

### Breaking Changes
* Now depends on Node 22, and VS Code 1.105.0 or higher.

## 0.4.3 - 18 September 2025
### Fixed
* Fixed an issue where images could not be inspected if they were built in Azure Container Registry. [#295](https://github.com/microsoft/vscode-docker-extensibility/issues/295)

## 0.4.2 - 8 September 2025
### Fixed
* Fixed an issue where inspection could fail if a container had unmapped ports. [#292](https://github.com/microsoft/vscode-docker-extensibility/issues/292)

## 0.4.1 - 22 July 2025
### Fixed
* Now depends on `@microsoft/vscode-container-client` v0.1.1, in order to get a fix. [#280](https://github.com/microsoft/vscode-docker-extensibility/issues/280)

## 0.4.0 - 10 July 2025
### Added
* Added a new `checkOrchestratorInstall` command for `ContainerOrchestratorClient`. [#274](https://github.com/microsoft/vscode-docker-extensibility/pull/274)

### Breaking Changes
* `spawnStreamAsync`, `Shell`, `commandLineBuilder`, and some related utilities have been moved to a new `@microsoft/vscode-processutils` package. Imports will need to be updated. [#277](https://github.com/microsoft/vscode-docker-extensibility/pull/277)

## 0.3.0 - 7 July 2025
### Added
* Support has been added for Podman Compose. [#264](https://github.com/microsoft/vscode-docker-extensibility/issues/264)

### Changed
* IPv6 addresses returned by the API will no longer have brackets. [#272](https://github.com/microsoft/vscode-docker-extensibility/pull/272)
* Internal to the library, Zod is now being used for validating objects from the various clients. [#248](https://github.com/microsoft/vscode-docker-extensibility/issues/248)

## 0.2.2 - 3 June 2025
### Added
* Added support for the `--platform` argument in `runContainer()`. [#258](https://github.com/microsoft/vscode-docker-extensibility/issues/258)

## 0.2.1 - 11 March 2025
### Added
* Added the container stats command. This would previously always throw a `CommandNotSupportedError`. However, the typing has changed to a `VoidCommandResponse`. [#254](https://github.com/microsoft/vscode-docker-extensibility/issues/254)

## 0.2.0 - 10 February 2025
### Added
* Added a client for Podman. [#221](https://github.com/microsoft/vscode-docker-extensibility/issues/221)

### Changed
* Some properties on certain objects have become optional, due to Podman not containing them. For example, network ID on network listing is not present on Podman v3.

## 0.1.2 - 1 August 2024
### Fixed
* Listing files fails due to new Bash behavior. [#231](https://github.com/microsoft/vscode-docker-extensibility/issues/231)
* Unable to inspect built-in networks. [#202](https://github.com/microsoft/vscode-docker-extensibility/issues/228)

## 0.1.1 - 18 October 2023
### Added
* Output from `docker prune` commands is now parsed for the items removed and space reclaimed.

## 0.1.0 - 31 August 2022
### Added
* Initial commit
* Adds support for various Docker runtimes (Docker in WSL, Docker Engine, Docker Desktop, etc.)
