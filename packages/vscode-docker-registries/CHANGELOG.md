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
