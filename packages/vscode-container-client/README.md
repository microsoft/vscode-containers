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
