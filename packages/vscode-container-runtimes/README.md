# vscode-container-runtimes

## Overview
This extension registers container runtime providers with the [Docker extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker) for Visual Studio Code. Simply install the extension, and choose which container runtime you would like to use. You can change at any time. The Docker extension will be automatically installed as a dependency of this extension.

## Usage
TODO: add a gif depicting switching container runtimes

## Contributing
To add support for a container runtime, add a client to the [container-runtimes](../container-runtimes/) package. Once a client has been created, a new registration can be added in this extension.

See also [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Telemetry
VS Code collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](https://go.microsoft.com/fwlink/?LinkID=528096&clcid=0x409) to learn more. If you don’t wish to send usage data to Microsoft, you can set the `telemetry.telemetryLevel` setting to `off`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).

## License
[MIT](LICENSE)
