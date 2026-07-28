---
name: Dockerfile and Containerfile best practices
description: Best practices for creating, reviewing, and updating Dockerfiles, Containerfiles, and .dockerignore files.
applyTo: "**/Dockerfile,**/Dockerfile.*,**/Containerfile,**/Containerfile.*,**/.dockerignore"
---

# Dockerfile and Containerfile guidance

- Refer to this extension as **Container Tools**, not the Docker extension.
- Inspect the application, package manifests, lockfiles, entry points, ports, build output, and existing container files before making changes. Preserve intentional behavior and repository conventions.
- Keep instructions portable across OCI-compatible builders unless the project clearly targets a specific runtime or platform. Do not assume Docker when the user might have configured Podman or another client.
- Use supported, trusted base images. Choose tags or digests that match the repository's update and reproducibility policy; never invent a digest.
- Use multi-stage builds when they keep build tools, source files, or caches out of the runtime image. Copy only the artifacts needed at runtime.
- Order layers so stable dependency metadata is copied before frequently changing source files. Combine package installation and cleanup where required to avoid retaining package-manager caches, but prefer readable layers over arbitrary layer-count reduction.
- Use a focused `.dockerignore` to exclude source-control data, local dependencies, build output that is regenerated in the image, credentials, and other irrelevant files. Do not exclude artifacts the build actually needs.
- Set an explicit working directory. Prefer `COPY` over `ADD` unless archive extraction or remote-source behavior is intentional.
- Run the application as a non-root user when practical. Set file ownership and permissions deliberately rather than applying broad permissions.
- Never bake credentials, tokens, private keys, or secret files into an image or pass secrets through `ARG` or `ENV`. Use a supported build-secret mechanism or inject secrets at runtime.
- Prefer exec-form `ENTRYPOINT` and `CMD` for long-running processes so signals are handled correctly. Use a shell form only when shell behavior is required and documented.
- Add a health check only when the application has a meaningful, inexpensive readiness signal and the deployment environment will use it.
- Avoid unnecessary packages, remote downloads, exposed ports, and mutable runtime state. Verify checksums or signatures for downloaded artifacts when the upstream project publishes them.
- Do not silently change the target operating system, CPU architecture, application version, public ports, startup command, or development-versus-production behavior. Explain material compatibility or security trade-offs.
- Validate syntax and, when appropriate, build behavior with the user's configured container client. Obtain the client from `#tool:ms-azuretools.vscode-containers/containerToolsConfig` before forming or running CLI commands.
