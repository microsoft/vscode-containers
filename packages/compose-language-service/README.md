# Docker Compose Language Service

## Overview

This project contains a language service for Docker Compose, implementing the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/). It is shipped in the [Container Tools](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-containers) extension for Visual Studio Code.

## Features

The Compose Language Service offers some common language service features like completions, signatures, diagnostics, document formatting, and hover hints. In addition, it contains some Docker-specific features like image names becoming hyperlinks to their corresponding pages on Docker Hub.

The language service is intended to work primarily for the [Compose file version 3 spec](https://docs.docker.com/compose/compose-file/compose-file-v3/)--it will not support properties specific to versions 1 or 2--but it shouldn't interfere with development in such documents either.

The language service is a work-in-progress, and will continue adding new features and functionality each release.

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Telemetry

VS Code collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](https://go.microsoft.com/fwlink/?LinkID=528096&clcid=0x409) to learn more. If you don’t wish to send usage data to Microsoft, you can set the `telemetry.telemetryLevel` setting to `off`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).

This language service will emit VS Code-specific telemetry events. If using the service outside of VS Code (e.g. in Vim), these telemetry events can be safely ignored.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
