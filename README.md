<div align="center">

# ServerLab MC

**A local-first desktop control center for Minecraft servers.**

Create, run, monitor, back up, and maintain local Minecraft servers from one polished operator console.

[![Release](https://img.shields.io/github/v/release/flennium/ServerLab-MC?label=release)](https://github.com/flennium/ServerLab-MC/releases)
[![License](https://img.shields.io/github/license/flennium/ServerLab-MC)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-2563eb)](#requirements)
[![Node](https://img.shields.io/badge/node-20%2B-22c55e)](#requirements)

</div>

## Overview

ServerLab MC is an Electron desktop app backed by a local Node.js service and a React renderer. It is built for people who run Minecraft servers locally and want a focused interface for server creation, Java runtime management, console access, files, backups, monitoring, and cached server software downloads.

Current release: `3.3.0`

## Highlights

- Create Minecraft servers with framework, version, build, RAM, port, and EULA handling.
- Download Vanilla, Paper, Purpur, Folia, and Fabric server software with real byte-based progress.
- Create and run Velocity, Waterfall, and BungeeCord proxy profiles from official release sources.
- Build Spigot locally through an isolated, cached BuildTools workflow with live build stages and logs.
- Reuse cached server software while keeping every server folder independent.
- Detect, install, validate, and assign Java runtimes per server.
- Start, stop, restart, and monitor local server processes.
- Browse, edit, rename, and delete files inside each server folder.
- Create and restore backups.
- Keep all app state local, authenticated, and stored under ServerLab-controlled data paths.

## Server Software Manager

ServerLab MC can resolve, download, cache, and install server software during server creation.

| Software | Type | Status | Notes |
| -------- | ---- | ------ | ----- |
| Paper | Server | Supported | High-performance Bukkit-compatible server using PaperMC metadata for builds and downloads. |
| Purpur | Server | Supported | Paper fork with additional gameplay and configuration features using Purpur metadata. |
| Folia | Server | Supported | Regionized-multithreading Paper fork using PaperMC metadata. |
| Fabric | Server | Supported | Lightweight mod-loader server using Fabric Meta launcher artifacts. |
| Vanilla | Server | Supported | Official Mojang release metadata and server jar downloads. Vanilla servers do not expose a Plugins tab. |
| Spigot | Server | Supported | Builds locally through the official BuildTools workflow; the generated artifact is cached and reused. |
| Forge | Server | Planned | Modded server platform requiring installer-based setup. |
| NeoForge | Server | Planned | Modern Forge ecosystem with installer-based setup. |
| Quilt | Server | Planned | Fabric-compatible mod loader using Quilt Meta services. |
| Velocity | Proxy | Supported | Modern PaperMC proxy downloaded from the official PaperMC downloads service. Current releases require Java 25. |
| Waterfall | Proxy | Supported, legacy | End-of-life PaperMC proxy. Official releases only; Velocity is recommended for new networks. |
| BungeeCord | Proxy | Supported, legacy | Official Spigot Jenkins distribution only. Velocity is recommended for new networks. |

Cached server software is stored in the app data directory. When a server is created, ServerLab copies the cached artifact into that server folder as `server.jar`, so existing servers never depend on the cache.

Modrinth plugin management is available for plugin-capable server software and proxies: Paper, Purpur, Folia, Spigot, Fabric, Velocity, Waterfall, and BungeeCord. Vanilla servers intentionally omit plugin management because the official Vanilla server does not provide a plugin loader. Proxy plugins are checked against their exact loader; an optional target Minecraft version enables additional compatibility checks.

Proxy downloads use official providers only: PaperMC for Velocity and Waterfall, and Spigot Jenkins for BungeeCord. ServerLab never falls back to third-party mirrors. Cached artifacts remain reusable when an official provider is temporarily unavailable.

Spigot builds require a compatible JDK. ServerLab downloads and caches portable MinGit automatically when needed, without changing the system PATH or requiring administrator permissions. System Git is used as a fallback. ServerLab runs BuildTools in an isolated workspace, shows real download progress plus an expandable build log, verifies the generated jar, and keeps the final server copy independent from the cache.

## Java Runtime Center

ServerLab MC replaces raw `javaPath` setup with managed runtime selection.

| Capability           | Description                                                                   |
| -------------------- | ----------------------------------------------------------------------------- |
| Detection            | Finds system Java installs and ServerLab-managed runtimes.                    |
| Managed installs     | Downloads verified archive-based runtimes into app data.                      |
| Recommendations      | Picks a compatible Java major for the selected Minecraft/software version.    |
| Per-server selection | Stores the selected runtime and uses its absolute executable path at startup. |

Managed runtime providers:

- Eclipse Temurin through Adoptium
- Microsoft OpenJDK fallback

Legacy manual Java paths remain available as an advanced override.

## Tech Stack

| Layer    | Technology                         |
| -------- | ---------------------------------- |
| Desktop  | Electron main and preload process  |
| Renderer | React, Vite, Tailwind CSS, Zustand |
| Backend  | Node.js, Express, Socket.IO        |
| Storage  | Prisma, SQLite                     |
| Build    | esbuild, electron-builder          |

## Requirements

- Windows is the primary supported target.
- Node.js 20 or newer.
- npm 10 or newer.

## Install And Uninstall

The Windows installer registers ServerLab MC in Windows Apps & Features and creates Start Menu shortcuts. To remove the app, use Apps & Features or open Start Menu > ServerLab MC > Uninstall ServerLab MC.

## Getting Started

Install dependencies:

```powershell
npm install
```

Start development mode:

```powershell
npm run dev
```

Stop leftover development processes:

```powershell
npm run dev:stop
```

Reset local test data:

```powershell
npm run reset:data
```

Force reset without confirmation:

```powershell
npm run reset:data:force
```

## Commands

| Command                 | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `npm run dev`           | Start the local development app.                             |
| `npm run dev:stop`      | Stop leftover dev processes on ServerLab ports.              |
| `npm run lint`          | Run ESLint across TypeScript and React source.               |
| `npm test`              | Run Vitest tests.                                            |
| `npm run build`         | Build shared, renderer, Electron, backend, and stage output. |
| `npm run package`       | Build the Windows installer with electron-builder.           |
| `npm run release:check` | Run lint, tests, build, and packaging as the release gate.   |

## Local Data

Development data is stored in:

```text
data/
```

Runtime data includes:

- `data/serverlab.db`
- `data/backups/`
- `data/logs/`
- `data/java-runtimes/`
- `data/software-cache/`

Production data is stored in Electron's `userData` directory.

ServerLab MC does not modify global Java settings, `JAVA_HOME`, system `PATH`, registry entries, package managers, or machine-wide Minecraft folders.

## Project Structure

```text
apps/
  backend/    Local Express, Socket.IO, Prisma, and server lifecycle services
  electron/   Electron main and preload process
  renderer/   React operator console
packages/
  shared/     Shared API, model, event, and app metadata types
scripts/      Build, dev, reset, and packaging helpers
```

## Production Checklist

Before publishing a release:

1. Remove generated local data and build outputs from the working tree.
2. Run `npm run lint`.
3. Run `npm run test:ci`.
4. Run `npm run build`.
5. Run `npm run package`.
6. Smoke test a fresh install and an upgrade from existing data.
7. Test server creation, cached software reuse, Java runtime selection, server start/stop, file editing, backups, and settings.
8. Verify the updater metadata and stable-channel behavior in the packaged build.
9. Update release notes, create a version tag, and let GitHub Actions publish the release.

Use `npm run version:stable` to update the root and workspace package metadata before tagging a stable release.

## Auto Updates

Packaged ServerLab MC builds use `electron-updater` with the GitHub stable release feed. The Updates panel in Settings lets you check manually, control automatic checks, downloads and installation, view release notes and progress, and skip a non-mandatory version.

Beta and alpha releases are never recommended by the stable updater. Installing an update is blocked while managed Minecraft servers are running; you can stop them gracefully from the update panel before continuing.

Updater diagnostics are stored locally at `%APPDATA%\\ServerLab MC\\logs\\updater.log`. Update binaries are verified through `latest.yml`; `update-meta.json` contains release policy metadata only.

## Automated Releases

GitHub Actions builds and publishes Windows releases from version tags. When a versioned commit is pushed to `main`, the workflow reads the root package version, creates the matching tag if it does not exist, and starts the release build automatically.

```powershell
# Manual recovery path when a tag needs to be recreated or retried:
  git tag v3.3.0
  git push origin v3.3.0
```

The `Build and Publish Release` workflow runs `npm ci`, lint, CI-safe tests, and the Windows installer build. It uploads the installer, blockmap, `latest.yml`, and `update-meta.json` to the GitHub Releases page.

Release history is tracked in [CHANGELOG.md](CHANGELOG.md).

## Troubleshooting

If the app shows connection errors for `127.0.0.1:3001`, the backend is not running or the port is occupied:

```powershell
npm run dev:stop
npm run dev
```

If Vite reports port `5173` is in use, close the old dev server or stop the owning process.

If Prisma generation fails because `query_engine-windows.dll.node` is locked, stop Electron/backend processes and rerun the build.

## Documentation

- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## License

ServerLab MC is licensed under the MIT License.

See [LICENSE](LICENSE).
