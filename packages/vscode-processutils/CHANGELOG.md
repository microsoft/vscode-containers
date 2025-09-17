## 0.1.3 - 17 September 2025
### Added
* Added a new `alternatePath` parameter to `getSafeExecPath`, to allow passing in an alternative `PATH` to search. [#294](https://github.com/microsoft/vscode-docker-extensibility/pull/294)

## 0.1.2 - 25 August 2025
### Added
* Added a helper method to convert a Node.js `AbortSignal` into a `CancellationTokenLike`. [#288](https://github.com/microsoft/vscode-docker-extensibility/pull/288)

## 0.1.1 - 22 July 2025
### Fixed
* Fixed an issue involving non-shell execution on Windows. [#280](https://github.com/microsoft/vscode-docker-extensibility/issues/280)

## 0.1.0 - 10 July 2025
### Added
* Initial release. This contains the command line building, shell, and process execution features previously in `@microsoft/vscode-container-client`.
