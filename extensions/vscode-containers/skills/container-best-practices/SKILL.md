---
name: container-best-practices
description: Create, review, modernize, optimize, troubleshoot, and validate Dockerfiles, Containerfiles, .dockerignore files, and Compose applications. Use for containerizing a workspace, improving image size, caching, reproducibility or security, adding Compose services, or diagnosing container build and configuration failures.
---

# Container best practices

Use this workflow for workspace-level container authoring, review, optimization, and troubleshooting.

Apply the detailed [Dockerfile and Containerfile guidance](./dockerfile.instructions.md) and [Compose guidance](./compose.instructions.md) whenever those files are in scope.

## 1. Understand the project

1. Search for existing Dockerfiles, Containerfiles, `.dockerignore`, Compose files, development-container configuration, deployment manifests, and container-related tasks.
2. Inspect application manifests, lockfiles, build scripts, entry points, generated output, runtime versions, listening ports, environment templates, and persistence requirements.
3. Infer safe choices from the repository. Ask the user only about decisions that materially affect behavior and cannot be inferred, such as the intended deployment target or whether a service is development-only.
4. Preserve existing runtime, platform, and repository conventions unless the request explicitly changes them.

## 2. Choose the workflow

- **Create:** Generate the smallest coherent set of container files needed for the request. Include `.dockerignore` when creating a build context. Add Compose only when the application needs multi-service orchestration or the user requests it.
- **Review or modernize:** Identify correctness, security, reproducibility, caching, image-size, portability, and maintainability issues. Prioritize high-impact findings, then make focused edits without rewriting sound configuration.
- **Troubleshoot:** Reproduce the failure from existing diagnostics or command output, isolate whether it comes from the build context, image build, startup command, Compose interpolation or merge behavior, service readiness, ports, mounts, or runtime compatibility, and fix the root cause.

## 3. Use the configured runtime

Before generating or running any container or Compose CLI command, invoke `#tool:ms-azuretools.vscode-containers/containerToolsConfig`.

- Use the exact container and orchestrator base commands returned by the tool.
- Account for environment variables that Container Tools applies to agent-created terminals.
- Do not substitute `docker`, `docker compose`, `podman`, or `podman compose` based on assumptions.
- Ask for confirmation before destructive commands or commands that push, publish, prune, remove, or mutate external resources.

## 4. Implement focused changes

1. Explain any material choice involving base images, target platforms, public ports, startup behavior, users and permissions, secrets, persistent data, or development-versus-production behavior.
2. Avoid embedding secrets or copying credentials into the build context.
3. Do not add unrelated infrastructure or application refactors.
4. Retain user comments and intentional settings unless they are made obsolete by the change.

## 5. Validate

Use the narrowest validation that covers the change:

- Check editor diagnostics for the affected files.
- Validate the merged Compose configuration with the configured orchestrator client.
- Build the relevant target with the configured container client when a build is necessary to prove the change.
- Start services only when runtime behavior must be verified and doing so will not conflict with existing resources.

Do not hide validation failures or claim success from a partial check. Report the failing command, the relevant error, and what remains unresolved.

## 6. Report

Summarize the files and behavior changed, important trade-offs, and unresolved risks. Mention commands only when they help the user reproduce or understand the result.
