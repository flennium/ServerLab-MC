<div align="center">

# ServerLab MC

**A local-first desktop control center for Minecraft servers.**

Create, run, monitor, back up, and maintain local Minecraft servers from one polished operator console.

[![Release](https://img.shields.io/github/v/release/flennium/ServerLab-MC?include_prereleases&label=release)](https://github.com/flennium/ServerLab-MC/releases)
[![License](https://img.shields.io/github/license/flennium/ServerLab-MC)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-2563eb)](#requirements)
[![Node](https://img.shields.io/badge/node-20%2B-22c55e)](#requirements)

</div>

## Overview

ServerLab MC is an Electron desktop app backed by a local Node.js service and a React renderer. It is built for people who run Minecraft servers locally and want a focused interface for server creation, Java runtime management, console access, files, backups, monitoring, and cached server software downloads.

Current beta: `3.0.0-beta.2`

## Highlights

- Create Minecraft servers with framework, version, build, RAM, port, and EULA handling.
- Download Paper, Purpur, and Fabric server software with real byte-based progress.
- Reuse cached server software while keeping every server folder independent.
- Detect, install, validate, and assign Java runtimes per server.
- Start, stop, restart, and monitor local server processes.
- Browse, edit, rename, and delete files inside each server folder.
- Create and restore backups.
- Keep all app state local, authenticated, and stored under ServerLab-controlled data paths.

## Server Software Manager

ServerLab MC can resolve, download, cache, and install server software during server creation.

| Provider | Status        | Notes                                            |
| -------- | ------------- | ------------------------------------------------ |
| Paper    | Supported     | Uses PaperMC provider metadata.                  |
| Purpur   | Supported     | Uses Purpur provider metadata.                   |
| Fabric   | Supported     | Uses Fabric Meta server launcher artifacts.      |
| Spigot   | Not available | Reserved for a future legal BuildTools workflow. |

Cached server software is stored in the app data directory. When a server is created, ServerLab copies the cached artifact into that server folder as `server.jar`, so existing servers never depend on the cache.

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
3. Run `npm test`.
4. Run `npm run build`.
5. Run `npm run package`.
6. Smoke test a fresh install and an upgrade from existing data.
7. Test server creation, cached software reuse, Java runtime selection, server start/stop, file editing, backups, and settings.
8. Update release notes and publish a GitHub release.

Release history is tracked in [CHANGELOG.md](CHANGELOG.md).

## Roadmap

Planned plugin management work:

- Browse and install Minecraft plugins from Modrinth.
- Search plugins by loader, Minecraft version, category, and popularity.
- Check plugin compatibility against the selected server software and Minecraft version.
- Detect installed plugin versions and surface available updates.
- Manage plugin enablement, removal, and update history directly from ServerLab.

Planned template work:

- Template browser for local and community templates.
- Import and export portable template bundles.
- One-click server creation from trusted templates.
- Template metadata, versioning, and update checks.

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
