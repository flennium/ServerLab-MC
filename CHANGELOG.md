# Changelog

## 3.0.0-beta.1

This beta prepares ServerLab MC for a broader production release.

### Added

- Java Runtime Center with runtime detection, managed runtime installs, validation, and per-server runtime assignment.
- Server Software Manager with Paper, Purpur, and Fabric provider support.
- Server software cache with reuse across server creation.
- EULA-gated server creation for downloaded Minecraft server software.
- Software cache management in Settings.
- Reset and stop-dev scripts for repeatable local testing.
- Initial production safety tests for Java parsing, startup arguments, download URL allow-listing, and file sandboxing.

### Changed

- Bumped app and workspace versions to `3.0.0-beta.1`.
- Centralized app version and user-agent metadata in the shared package.
- Lazily loaded renderer pages to reduce initial bundle pressure.
- Moved local data/cache/runtime folders out of release scope through gitignore cleanup.
- Cleaned release docs, comments, package metadata, and build output messages.

### Fixed

- Removed production DevTools opening.
- Added Socket.IO startup-token authentication.
- Restricted backend CORS to local Electron/Vite origins.
- Replaced unauthenticated data-path fetches with the authenticated API client.
- Strengthened file manager path traversal checks.
- Added quoted startup argument parsing for server launches.
- Removed unfinished template installer code from the beta surface.

### Known Beta Notes

- Spigot remains unavailable until a legal BuildTools workflow is implemented.
- Java/software provider coverage will continue expanding after beta feedback.
- The packaged app targets Windows first.

