## 0.4.1 - 14 October 2025
### Fixed
* Better error messages in the tree when errors occur. [#310](https://github.com/microsoft/vscode-docker-extensibility/pull/310)

## 0.4.0 - 6 October 2025
### Added
* Package is now a combined CJS+ESM package, instead of just CJS. [#297](https://github.com/microsoft/vscode-docker-extensibility/pull/297)

### Breaking Changes
* Now depends on Node 22, and VS Code 1.105.0 or higher.

## 0.3.0 - 2 September 2025
### Fixed
* Fixed several 404 errors for certain images in V2 registries, and made the created date lookup more robust. [#290](https://github.com/microsoft/vscode-docker-extensibility/pull/290)

### Breaking Changes
* Some breaking changes are present in the `RegistryV2DataProvider` class.

## 0.2.2 - 22 August 2025
### Fixed
* Updated to support VSCode typings beyond 1.96.0. [#287](https://github.com/microsoft/vscode-docker-extensibility/pull/287)

## 0.2.1 - 31 July 2025
### Fixed
* Fixed an issue where `service` and `scope` parameters for OAuth requests were being sent as headers, when they should have been sent as query parameters. [#279](https://github.com/microsoft/vscode-docker-extensibility/issues/279)

## 0.2.0 - 7 January 2025
### Fixed
* Fixes an issue that would cause infinite looping on registries that used paging in tags listing. [#243](https://github.com/microsoft/vscode-docker-extensibility/issues/243)
* The above required a breaking alteration to the `RegistryV2RequestOptions` interface.

## 0.1.13 - 17 December 2024
### Fixed
* Fixed 404 when exploring and pulling GHCR images. [#238](https://github.com/microsoft/vscode-docker-extensibility/issues/238)

## 0.1.12 - 1 August 2024
### Fixed
* Fixed inspect image manifest 404. [#225](https://github.com/microsoft/vscode-docker-extensibility/pull/225)

## 0.1.11 - 10 January 2023
### Fixed
* Fixed an issue that prevented loading more than 10 repositories/tags from Docker Hub

## 0.1.10 - 5 December 2023
### Fixed
* Fixed a bug that prevented disconnecting from generic registries with certain special characters in the URL

## 0.1.9 - 5 December 2023
### Fixed
* Fixed Docker Hub sign in URL so that signing in from the CLI works more reliably

## 0.1.8 - 14 November 2023
### Fixed
* Uses Node.js 18 and removes the use of `node-fetch`

## 0.1.7 - 30 October 2023
### Fixed
* Fixed an infinite loop when getting a long list of repositories.

## 0.1.6 - 24 October 2023
### Added
* A method for getting the manifest of an image was added to `RegistryV2DataProvider`

## 0.1.1 to 0.1.5 - 13 October 2023
### Fixed
* Minor changes only

## 0.1.0 - 20 September 2023
### Added
* Initial commit
* Adds support for Docker Hub, generic V2 registry, and GitHub Container Registry
