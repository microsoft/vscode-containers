# OCI Layout Prerequisites

The **OCI Layout** view lets you export images from a container runtime — or pull them directly from a registry — into an [OCI image layout](https://github.com/opencontainers/image-spec/blob/main/image-layout.md) on disk so you can inspect their manifests, configs, and layers.

To do that, the extension needs **either Podman or [ORAS](https://oras.land/)** available on your system:

| Container runtime | Additional tool required? | Why |
| --- | --- | --- |
| **Podman** | None | `podman save --format oci-dir` writes an OCI image layout directly. |
| **Docker** | **ORAS (`oras` on `PATH`)** | `docker save` only produces a Docker archive (a tar of Docker-specific JSON). ORAS is used to convert that archive into an OCI image layout and to copy images from registries straight into an OCI layout. |

If you only need to **view** an existing OCI layout folder on disk, no extra tool is required — neither Docker nor Podman is involved.

## Installing ORAS

Pick the option that matches your platform:

- **Official downloads & instructions:** <https://oras.land/docs/installation>
- **Homebrew (macOS / Linux):** `brew install oras`
- **Winget (Windows):** `winget install oras-project.oras`
- **Scoop (Windows):** `scoop install oras`
- **Chocolatey (Windows):** `choco install oras`

After installing, make sure `oras` is on your `PATH`. You can confirm with:

```sh
oras version
```

> If you just installed ORAS, you may need to reload the VS Code window (`Developer: Reload Window`) so the new `PATH` entry is picked up.

## Installing Podman

If you prefer Podman over Docker + ORAS:

- **Official installation guide:** <https://podman.io/docs/installation>

Once Podman is installed, switch this extension's runtime via the **Containers: Choose Container Runtime** command (or set `containers.containerClient` to `com.microsoft.visualstudio.containers.podman`).

## Why does this matter?

Docker's `docker save` format predates the OCI image-layout spec and is not directly compatible with it. Tooling that wants an OCI layout — including this extension's **OCI Layout** view — needs a converter. ORAS is the standard CNCF tool for that conversion and also supports pulling images directly from any OCI-compliant registry into an OCI image layout.

Podman, by contrast, can write the OCI layout format natively, so it doesn't need a separate converter.
