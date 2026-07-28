---
name: Compose best practices
description: Best practices for creating, reviewing, and updating Compose application files.
applyTo: "**/compose.yaml,**/compose.yml,**/compose.*.yaml,**/compose.*.yml,**/docker-compose.yaml,**/docker-compose.yml,**/docker-compose.*.yaml,**/docker-compose.*.yml"
---

# Compose guidance

- Refer to this extension as **Container Tools**, not the Docker extension.
- Inspect the application, existing container files, environment templates, ports, persistence requirements, and service dependencies before making changes.
- Follow the current Compose Specification. Do not add the obsolete top-level `version` field. Prefer `compose.yaml` for a new primary file, but preserve an existing supported file name unless renaming is part of the request.
- Keep build contexts narrow. Set `dockerfile` when its name or location is not the default, and keep build arguments free of secrets.
- Use service names for inter-service discovery. Avoid `container_name` unless a fixed external name is genuinely required because it prevents normal scaling and can cause name collisions.
- Publish only ports that host users or external systems need. Use `expose` or no port declaration for service-to-service traffic, and bind development-only ports to an appropriate host interface.
- Add health checks only when a meaningful probe exists. When startup order depends on readiness rather than process creation, use a health check with an appropriate dependency condition and ensure the target Compose implementation supports it.
- Store persistent data in clearly named volumes and immutable configuration in configs where supported. Use bind mounts deliberately for local development and avoid obscuring files required from the image.
- Do not commit secrets in the Compose file or an environment file. Use Compose secrets, an external secret store, or runtime injection as appropriate. Treat `.env` as interpolation input, not a secure secret store.
- Prefer explicit, minimal networks. Avoid privileged mode, host networking, host PID/IPC namespaces, device access, broad capabilities, and writable host mounts unless the workload requires them and the risk is explained.
- Use profiles and override files to separate optional or development-only services without duplicating the base application. Keep production-specific deployment assumptions out of a general development file.
- Preserve intentional image tags, restart policies, resource settings, platform constraints, ports, volumes, and environment behavior. Explain material compatibility or security changes.
- Validate the merged configuration with the user's configured Compose client. Obtain the orchestrator command from `#tool:ms-azuretools.vscode-containers/containerToolsConfig` before forming or running CLI commands, and do not assume `docker compose`.
