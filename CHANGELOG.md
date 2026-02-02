## 2.4.1 - 3 February 2026
### Fixed
* Extension telemetry was not being sent. [#367](https://github.com/microsoft/vscode-containers/issues/367)
* Extension is now being built as an ESM module, allowing for code splitting and faster load times. [#366](https://github.com/microsoft/vscode-containers/issues/366)

## 2.4.0 - 26 January 2026
### Added
* The ability to search and filter containers and images has been added. VS Code has a built-in filtering feature, but it is not well-known, and due to implementation details was not practical for the Container Explorer views. [#253](https://github.com/microsoft/vscode-containers/pull/253)
* The ability to reverse-sort the views by name, created time, and (for images only) size has been added. [#317](https://github.com/microsoft/vscode-containers/issues/317)

### Changed
* Most of the extension settings have been marked as "advanced". As a result, they are not shown by default in the settings editor, but can be shown by clicking the filter icon and choosing "Advanced", or putting `@tag:advanced` in the settings search bar. [#296](https://github.com/microsoft/vscode-containers/issues/296)
* The underlying Azure authentication library has been updated, affecting the Registries view when Azure is connected. This should not change functionality, but should be faster, especially for those with many accounts and/or Azure tenants. [#311](https://github.com/microsoft/vscode-containers/pull/311)
* For .NET scaffolding and debugging scenarios, we have made an underlying implementation change to simplify our code. However, this change will cause unsupported .NET versions (versions 7 and below) to stop working. It is strongly recommended to upgrade to the latest .NET versions, both for security and support. [#195](https://github.com/microsoft/vscode-containers/issues/195)

### Fixed
* When deploying from Azure Container Registry to Azure App Service, the webhook created for auto-redeployment is fixed and working again. [#332](https://github.com/microsoft/vscode-containers/issues/332)

## 2.3.0 - 10 November 2025
### Added
* Copilot tools for container management are now available! Easily interact with containers through chat. [#256](https://github.com/microsoft/vscode-containers/issues/256)
* Containers and images now have an "Ask Copilot" gesture in their context menus in the Container Explorer view. [#274](https://github.com/microsoft/vscode-containers/issues/274)
* `Containerfile` (and similar) now supported as a name for Dockerfiles. [#237](https://github.com/microsoft/vscode-containers/issues/237)

### Changed
* For Windows containers, the base .NET image has been changed to `-nanoserver-ltsc2022` (previously `-nanoserver-1809`). This requires Windows 11. [#211](https://github.com/microsoft/vscode-containers/issues/211)
* With the finalization of the [authentication challenges API](https://code.visualstudio.com/updates/v1_105#_microsoft-authentication-now-supports-wwwauthenticate-claims-challenges) in VS Code, the minimum VS Code version is now 1.105.0. [#223](https://github.com/microsoft/vscode-containers/issues/223)

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
