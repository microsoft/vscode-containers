## 2.2.0 - 22 September 2025
### Added
* Added a "Compose Down - Select Services" command. This allows you to take down a subset of services in your compose project. [#82](https://github.com/microsoft/vscode-containers/pull/82)

### Changed
* Minor changes to the Dockerfiles created by the Go, Java, and Other templates. [#86](https://github.com/microsoft/vscode-containers/issues/86), [#158](https://github.com/microsoft/vscode-containers/issues/158)
* Changes were made to support the upcoming multi-factor authentication requirements for Azure. [#200](https://github.com/microsoft/vscode-containers/issues/200)

### Fixed
* Fixed a crash in the Dockerfile language service. [#139](https://github.com/microsoft/vscode-containers/issues/139)
* Fixed an issue where the Compose formatter would not work, if either RedHat's YAML extension or the Docker DX extension were present. [#151](https://github.com/microsoft/vscode-containers/issues/151)
* Fixed an issue where .NET apps with spaces in the project name would fail to debug on Linux. [#169](https://github.com/microsoft/vscode-containers/issues/169)
* Fixed an issue that could cause OAuth to fail when connecting to certain generic v2 registries. [#190](https://github.com/microsoft/vscode-containers/pull/190)
* Fixed an issue that could cause registry image manifest inspection and deletion to fail with a 404 error. [#209](https://github.com/microsoft/vscode-containers/issues/209)

## 2.1.0 - 21 July 2025
### Added
* Added support for Podman Compose (`podman compose`). You can use the command `Containers: Choose container runtime...` to select Podman and Podman Compose. [#54](https://github.com/microsoft/vscode-containers/issues/54)

### Changed
* Newly-scaffolded compose files will be named `compose.yaml` (as opposed to `docker-compose.yml`). Old files will continue to work as before. [#146](https://github.com/microsoft/vscode-containers/issues/146)

### Fixed
* Fixed an issue preventing .NET SDK-style debugging of .NET 10 Preview 5 apps. [#157](https://github.com/microsoft/vscode-containers/issues/157)
* Fixed an issue where a broken port choice would appear when opening a container in the browser, beginning with Docker Desktop 4.42.0. [#163](https://github.com/microsoft/vscode-containers/issues/163)
* Fixed `ctime`, `mtime`, and `atime` file timestamps not being updated when modifying files in the Container Explorer view. [#95](https://github.com/microsoft/vscode-containers/issues/95)

## 2.0.3 - 5 June 2025
### Changed
* Some compose language service features will automatically disable if the [Docker DX](https://marketplace.visualstudio.com/items?itemName=docker.docker) extension is present, in order to avoid duplication and conflicts. [#75](https://github.com/microsoft/vscode-containers/pull/75)

## 2.0.2 - 27 May 2025
### Changed
* Minor change to the toast notification when the [Docker extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker) is also installed. [#89](https://github.com/microsoft/vscode-containers/pull/89)

## 2.0.1 - 6 May 2025
### Added
* Added a command to change container runtime, in the command palette and Containers view in the Container Explorer. [#56](https://github.com/microsoft/vscode-containers/issues/56)

## 2.0.0 - 21 April 2025
### Initial Release
* Initial release of the Container Tools extension. This extension has all the features of the Docker extension and more. See [here](https://aka.ms/vscode-container-tools-learn-more) for additional information.
* The Container Tools extension supports multiple container runtime options, such as Docker or Podman. If you want to change runtimes, you can do so with the VS Code setting `containers.containerClient`. Changing requires a restart to take effect.
