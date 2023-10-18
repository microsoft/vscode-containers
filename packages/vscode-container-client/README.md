# vscode-container-client

## Overview
This package adds support for various Docker container runtimes, abstracting away the details of the runtime and the way it is called, to provide a common interface for any Docker runtime (e.g. Docker in WSL, Docker Engine, Docker Desktop, etc.).

## Usage
Each of the runtime clients provide a command line to execute and a function to parse the output, for each relevant operation. These items are combined into a `CommandResponse` object. In addition, many helpful utility classes are provided, for building command lines, running the commands, and a handful of other scenarios.

## Example
Here is an example for inspecting a container that uses the `ShellStreamCommandRunnerFactory` provided by this library:
```typescript
// Build the necessary objects
const dockerClient = new DockerClient();
const factory = new ShellStreamCommandRunnerFactory({
    // Many options are supported
});
const runCommand = factory.getCommandRunner();

// Get the command response, and run it in the shell command runner
const inspectionResults: InspectContainersItem[] | undefined = await runCommand(
    dockerClient.inspectContainers({ containers: ['myContainerName'] })
);

// Get the first item in the results
const result: InspectContainersItem | undefined = inspectionResults?.[0];

// If an item was found, output some information about it
if (result) {
    console.log(`${result.name} is running image ${result.imageName} (${result.imageId})`);
}
```

## License
[MIT](LICENSE)

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

## Microsoft Open Source Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).

Resources:

- [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/)
- [Microsoft Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/)
- Contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with questions or concerns
