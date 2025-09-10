# Container Tools for Visual Studio Code

Container Tools is a VS Code extension that makes it easy to build, manage, and deploy containerized applications. It provides one-click debugging of Node.js, Python, and .NET inside containers, supports Docker and Podman, and includes scaffolding for container files.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap and Build
- Install dependencies: `npm install` -- takes 6 seconds (30 seconds on first install)
- Build extension: `npm run build` -- takes 42 seconds. NEVER CANCEL. Set timeout to 60+ minutes.
- Lint code: `npm run lint` -- takes 5 seconds
- TypeScript compile: `npm run pretest` -- takes 6 seconds
- Watch mode (development): `npm run watch` -- runs continuously for development

### Testing and Validation
- Run tests: `npm test` -- requires VS Code environment, will fail in headless mode. This is EXPECTED behavior.
- Test compilation: `npm run pretest` -- takes 6 seconds. Always run this to validate TypeScript compilation.
- Package extension: `npm run package` -- creates .vsix file for distribution
- NEVER CANCEL builds or long-running operations. Build commands may take up to 45 seconds.

### Development Workflow
- Start development: `npm run watch` to enable continuous compilation during development
- Build for production: `npm run build` with proper timeout settings
- Always run `npm run lint` before committing changes or the CI will fail
- Always run `npm run pretest` to ensure TypeScript compilation succeeds

## Validation Scenarios

After making changes, ALWAYS validate by running through these scenarios:

### Basic Extension Validation
1. Build successfully: `npm run build` (timeout: 60+ minutes)
2. Lint passes: `npm run lint`
3. TypeScript compiles: `npm run pretest`
4. Extension packages: `npm run package`

### Key Functionality Testing
- The extension provides container management for Docker and Podman
- Scaffolds Dockerfiles, .dockerignore, and compose files for multiple platforms
- Supports debugging Node.js, Python, and .NET applications in containers
- Provides container registry integration (Docker Hub, Azure Container Registry)
- Includes Docker Compose support with language services

### Manual Testing Areas
Since automated tests require VS Code environment, manually verify:
- Extension loads in VS Code without errors
- Command palette shows container-related commands
- Container explorer view displays properly
- Can scaffold Docker files for supported platforms (Node.js, Python, .NET, Go, Java, etc.)

## Build and Test Timing
- npm install: ~6 seconds (30 seconds on first install)
- npm run build: ~42 seconds (NEVER CANCEL - set 60+ minute timeout)
- npm run lint: ~5 seconds
- npm run pretest: ~6 seconds
- npm run package: ~3 seconds

## Common Tasks

### Project Structure
```
src/
├── commands/          # VS Code command implementations
├── debugging/         # Container debugging support
├── scaffolding/       # Docker file generation
├── tasks/            # Task providers for build/run
├── tree/             # Explorer tree views
├── runtimes/         # Docker/Podman client management
└── utils/            # Utility functions

resources/
├── templates/        # Scaffold templates for various platforms
├── ContainerTools.svg # Extension icon
└── walkthroughs/     # VS Code walkthrough content
```

### Key Files and Directories
- `package.json` - Extension manifest, commands, and dependencies
- `webpack.config.js` - Build configuration
- `tsconfig.json` - TypeScript configuration
- `eslint.config.mjs` - Linting rules
- `src/extension.ts` - Main extension entry point
- `src/commands/` - Command implementations
- `src/scaffolding/` - Docker file scaffolding logic
- `resources/templates/` - Platform-specific templates

### Package.json Scripts Reference
```json
{
  "scripts": {
    "watch": "webpack --watch",
    "build": "webpack --mode production --devtool hidden-source-map",
    "ci-build": "npm test",
    "package": "vsce package",
    "ci-package": "npm test && vsce package",
    "lint": "eslint --max-warnings 0 src --ext ts",
    "test": "node ./out/test/runTest.js",
    "pretest": "tsc -p ./",
    "test-watch": "tsc -watch -p ./"
  }
}
```

### Extension Dependencies
- Requires VS Code 1.95.0+
- Extension dependencies: vscode.docker, vscode.yaml
- Runtime requirements: Docker or Podman installed on system
- Node.js 20.x for development

## Platform Support
- Docker and Podman container runtimes
- Scaffolding for: Node.js, Python, .NET Core, Java, Go, C++, Ruby
- Container registries: Docker Hub, Azure Container Registry, Generic V2 registries
- Compose support: Docker Compose, Podman Compose

## Development Notes
- Uses webpack for bundling with TypeScript
- Language servers included for Dockerfile and Docker Compose
- Extension activates on various events (task types, file types, debug configurations)
- Supports both trusted and untrusted workspaces with feature restrictions

## Complete Fresh Clone Workflow
For a new clone of the repository, run these commands in order:

```bash
# 1. Install dependencies
npm install                    # Takes ~6 seconds

# 2. Validate code quality
npm run lint                   # Takes ~5 seconds - MUST PASS for CI

# 3. Build the extension
npm run build                  # Takes ~42 seconds - NEVER CANCEL

# 4. Package the extension (optional)
npm run package               # Takes ~3 seconds

# 5. Alternative: compile TypeScript for testing
npm run pretest               # Takes ~6 seconds
```

## Incremental Development Workflow
When making changes during development:

```bash
# Start watch mode for continuous compilation
npm run watch                 # Runs continuously until stopped

# In another terminal, validate changes
npm run lint                  # Always run before committing
npm run pretest              # Validate TypeScript compilation
```

## CRITICAL Reminders
- NEVER CANCEL build operations - they take 42+ seconds normally
- Always run `npm run lint` before committing - CI will fail otherwise
- Always run `npm run pretest` to validate TypeScript compilation
- Set timeouts to 60+ minutes for build commands to avoid premature cancellation
- Extension tests require VS Code environment - headless failures are expected
- Docker/Podman must be available on system for full functionality testing
- Watch mode (`npm run watch`) is useful for development but must be stopped manually

## Troubleshooting
- If build fails, try cleaning: `rm -rf node_modules dist out *.vsix && npm install`
- If TypeScript errors appear, run `npm run pretest` to get detailed error information
- If linting fails, errors must be fixed before committing (CI will fail)
- If tests fail with network errors (ENOTFOUND), this is expected in headless environments
- Build times are consistent: ~42 seconds is normal, not a hang
- The warning about newer vsce version can be ignored