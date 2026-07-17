# Container Tools for Visual Studio Code

## Overview

This is the repository for the Container Tools for Visual Studio Code extension.

## Extensions

* [Container Tools for Visual Studio Code](extensions/vscode-containers/README.md) -- the VS Code extension for building, managing, and deploying containerized applications.
* [Docker Extension Pack](extensions/vscode-docker/README.md) -- a thin extension pack that installs Container Tools, so existing users of the former "Docker" extension are migrated forward.

## Packages

These libraries are published to npm under the [`@microsoft`](https://www.npmjs.com/org/microsoft) scope and are consumed by the Container Tools extension (built directly from source in this monorepo):

* [`@microsoft/vscode-container-client`](packages/vscode-container-client/README.md) -- extensibility model for implementing container runtime providers (shared by VS and VS Code).
* [`@microsoft/vscode-docker-registries`](packages/vscode-docker-registries/README.md) -- extensibility model for contributing registry providers to the Container Tools extension.
* [`@microsoft/vscode-processutils`](packages/vscode-processutils/README.md) -- library support for building command lines and running external processes.
* [`@microsoft/vscode-inproc-mcp`](packages/vscode-inproc-mcp/README.md) -- library support for building in-process MCP servers.
* [`@microsoft/compose-language-service`](packages/compose-language-service/README.md) -- the Docker Compose language server, published to npm and consumed (built from source) by the Container Tools extension.

Additional shared packages will be added here as more repositories are consolidated into this monorepo (see [#520](https://github.com/microsoft/vscode-containers/issues/520)).

## Contributing

There are several ways you can contribute to this extension.

### Ideas, feature requests, and bugs
We are open to all ideas and we want to get rid of bugs! Use the Issues section to either report a new issue, provide your ideas or contribute to existing threads.

### Code
To contribute bug fixes, features, or design changes:
  * Clone the repository locally and open in VS Code.
  * Install [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint), [TypeScript 7](https://marketplace.visualstudio.com/items?itemName=typescriptteam.native-preview) and [esbuild Problem Matchers](https://marketplace.visualstudio.com/items?itemName=connor4312.esbuild-problem-matchers) for Visual Studio Code.
  * Open the terminal (<kbd>Ctrl</kbd>+ <kbd>\`</kbd> by default) and run `pnpm install`.
  * To build, open the Command Palette (<kbd>F1</kbd> by default) and type in `Tasks: Run Build Task`.
  * Debug: press <kbd>F5</kbd> (by default) to start debugging the extension.

### Legal

This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions provided by the bot. You will only need to do this once across all repos using our CLA.

### Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Telemetry

VS Code collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](https://go.microsoft.com/fwlink/?LinkID=521839) to learn more. If you don't wish to send usage data to Microsoft, you can set the `telemetry.telemetryLevel` setting to `off`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).

## License

[MIT](LICENSE.md)
