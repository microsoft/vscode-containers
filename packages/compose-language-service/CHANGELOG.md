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
