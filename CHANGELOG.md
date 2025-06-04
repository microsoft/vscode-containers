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
