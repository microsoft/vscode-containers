# Docker for Visual Studio Code: Extensibility Model [![Build Status](https://dev.azure.com/ms-azuretools/AzCode/_apis/build/status/vscode-docker-extensibility?branchName=main)](https://dev.azure.com/ms-azuretools/AzCode/_build/latest?definitionId=33&branchName=main)

# Overview
This package provides the necessary interfaces to implement a registry provider for the [Docker extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-docker) for Visual Studio Code. Additionally, it also contains an implementation of a registry provider for the common [Docker Registry HTTP API V2](https://docs.docker.com/registry/spec/api/). Most implementations will be a fairly slim inheriting implementation of this.

In order to implement a provider, you must create a VS Code extension which will activate when the Docker explorer view is opened, and register itself with the Docker extension. To appear in the list of known providers, you will need to submit a pull request in the [Docker extension repository](https://github.com/microsoft/vscode-docker) to update the manifest of providers, with your provider name, ID, and dependent extension ID.

# Issues
Issues are tracked in the [microsoft/vscode-docker](https://github.com/microsoft/vscode-docker/issues) repository.

# When to implement a registry provider extension
You should implement a registry provider extension if:
1. Your registry has advanced authentication (e.g. OAuth, etc.)
1. Your registry has a nonstandard API
1. Your registry has advanced features, beyond the basic image storage functionality

You should _not_ implement a registry provider extension if:
1. Your registry can be connected to already with the generic V2 provider
    - If only very minor changes are needed in the generic V2 provider to support your registry, please file an issue or submit a pull request instead
1. There is already an extension for your registry
1. Your extension will be closed-source

# How to implement a registry provider extension
// TODO - add a rough outline of how to do it

# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

# Microsoft Open Source Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).

Resources:

- [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/)
- [Microsoft Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/)
- Contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with questions or concerns
