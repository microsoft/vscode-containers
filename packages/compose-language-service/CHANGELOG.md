## 0.2.0 - 10 May 2023
### Breaking Changes
* The `ComposeLanguageClientCapabilities` type has been moved from `lib/client/DocumentSettings` to `lib/client/ClientCapabilities`

### Added
* The client can now specify whether an alternative YAML language service is present (e.g., from the YAML extension), selectively disabling features of this language service. [#122](https://github.com/microsoft/compose-language-service/issues/122)

## 0.1.3 - 13 February 2023
### Added
* Added an executable to launch the language server. [#114](https://github.com/microsoft/compose-language-service/issues/114)

## 0.1.2 - 20 July 2022
### Changed
* Switched to Node 16 and updates some dependencies. [#98](https://github.com/microsoft/compose-language-service/pull/98), [#102](https://github.com/microsoft/compose-language-service/pull/102)

## 0.1.1 - 8 April 2022
### Added
* Completions for the `profiles` section within a service. [#94](https://github.com/microsoft/compose-language-service/pull/94)

### Fixed
* Formatting should no longer remove document end markers. [#93](https://github.com/microsoft/compose-language-service/issues/93)

## 0.1.0 - 14 February 2022
### Fixed
* Merge keys are now allowed. [#78](https://github.com/microsoft/compose-language-service/issues/78)
* Better error messages. [#88](https://github.com/microsoft/compose-language-service/pull/88)

## 0.0.5-alpha - 15 December 2021
### Added
* Completions under the `build` section within a service. [#48](https://github.com/microsoft/compose-language-service/issues/48)

### Fixed
* `null` will no longer be inserted on empty maps. [#65](https://github.com/microsoft/compose-language-service/issues/65)
* Lines longer than 80 characters will no longer be wrapped. [#70](https://github.com/microsoft/compose-language-service/issues/70)
* Completions will no longer be suggested on lines that are already complete. [#68](https://github.com/microsoft/compose-language-service/issues/68)

## 0.0.4-alpha - 8 November 2021
### Fixed
* Removes test-scenario postinstall script as it was preventing installation.

## 0.0.3-alpha - 8 November 2021
### Fixed
* A handful of minor bugs relating to position logic (especially affecting hover).

## 0.0.2-alpha - 29 October 2021
### Added
* Significantly more completions have been added.

### Removed
* Removed signature help for ports, in favor of completions instead.

## 0.0.1-alpha - 20 September 2021
### Added
* Initial release!
* Hyperlinks to Docker Hub for images
* Hover info for many common Compose keys
* Signature help for ports
* Completions for volume mappings
* Diagnostics (currently validates correct YAML only, does not enforce Compose schema)
* Document formatting
