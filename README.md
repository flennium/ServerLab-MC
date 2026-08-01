# ServerLab MC

ServerLab MC is a local-first desktop dashboard for creating, running, and maintaining Minecraft servers. It combines an Electron shell, a local Node/Express backend, and a React operator console so server files, console output, backups, Java runtimes, and server software downloads can be managed from one place.

Current release target: `3.0.0-beta.1`.

## Features

- Create local Minecraft servers with framework, version, build, RAM, port, and EULA handling.
- Download and cache server software with real byte-based progress for Paper, Purpur, and Fabric.
- Reuse cached server jars while keeping each server folder independent.
- Manage Java runtimes from a dedicated Runtime Center, including system detection and managed installs.
- Start, stop, restart, and monitor local server processes.
- Browse, edit, rename, and delete files inside each server folder.
- Create and restore backups.
- Use a local authenticated backend token between Electron and the renderer.

## Tech Stack

- Electron main/preload process
- React, Vite, Tailwind CSS, Zustand, Socket.IO client
- Node.js, Express, Socket.IO, Prisma, SQLite
- esbuild and electron-builder for production packaging

## Requirements

- Windows is the primary supported target.
- Node.js 20 or newer is recommended.
- npm 10 or newer.
- GitHub CLI is recommended for release and PR workflows.

## Getting Started

Install dependencies:

```powershell
npm install
```

Start the app in development mode:

```powershell
npm run dev
```

Stop any leftover local dev processes:

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

## Useful Commands

```powershell
npm run build
npm run package
npm run lint
npm test
npm run release:check
```

Notes:

- `npm run build` compiles shared types, renderer, Electron, backend, and the Electron stage folder.
- `npm run package` builds the app and runs electron-builder.
- `npm run release:check` runs linting, tests, build, and packaging.

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

Production data is stored in Electron's `userData` directory. ServerLab does not modify global Java settings, `JAVA_HOME`, system `PATH`, or machine-wide Minecraft/server folders.

## Server Software Cache

Server software downloads are cached under the app data directory. Cached jars are used as source artifacts only. When a server is created, ServerLab copies the cached artifact into the server folder as `server.jar`, so deleting cache entries does not break existing servers.

Initial software providers:

- Paper
- Purpur
- Fabric
- Spigot is represented as unavailable until a legal BuildTools workflow is implemented.

## Java Runtime Management

The Java Runtime Center can detect system Java installations and install ServerLab-managed runtimes into app data. Server creation and startup prefer an assigned Java runtime ID when present, while legacy manual `javaPath` remains available as an advanced override.

Managed runtime providers:

- Eclipse Temurin through Adoptium
- Microsoft OpenJDK fallback

## Project Structure

```text
apps/
  backend/    Local Express, Socket.IO, Prisma, server lifecycle services
  electron/   Electron main and preload process
  renderer/   React user interface
packages/
  shared/     Shared API, model, and socket event types
scripts/      Build, dev, reset, and packaging helpers
```

## Production Checklist

Before publishing a release:

1. Remove generated local data and build outputs from the working tree.
2. Run `npm run lint`.
3. Run `npm run build`.
4. Run `npm run package`.
5. Smoke test a fresh install and an upgrade from existing data.
6. Test server creation, cached server software reuse, Java runtime selection, server start/stop, file editing, backups, and settings.
7. Update versions and release notes.
8. Create a tagged GitHub release.

For release history, see [CHANGELOG.md](CHANGELOG.md).

## Troubleshooting

If the app shows connection errors for `127.0.0.1:3001`, the backend is not running or the port is occupied. Stop stale dev processes and restart:

```powershell
npm run dev:stop
npm run dev
```

If Vite reports port `5173` is in use, close the old dev server or stop the owning process.

If Prisma generation fails because `query_engine-windows.dll.node` is locked, stop Electron/backend processes and rerun the build.

- [Contributing Guide](CONTRIBUTING.md) — Guidelines for developers who want to contribute to ServerLab MC.
- [Security Policy](SECURITY.md) — Security practices, vulnerability reporting, and responsible disclosure process.

## License

ServerLab MC is open-source software licensed under the MIT License.

You are free to:

- Use the software for personal or commercial purposes.
- Modify the source code.
- Distribute copies of the software.
- Create and distribute derivative works.

The software is provided "as is", without warranty of any kind.

See the full license text in the [LICENSE](LICENSE).
