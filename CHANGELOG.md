# Changelog

## 3.0.0-beta.5

### Changed

- Switched UI logo references to packaged-safe relative paths.
- New server creation now suggests the next available server port.

### Fixed

- App logo now renders correctly in packaged Electron builds.
- Creating multiple servers no longer defaults them all to port `25565`.

## 3.0.0-beta.4

### Added

- Default server creation location under the app data `servers` folder.
- Optional custom server folder selection during server creation.
- App logo in the title bar and main sidebar.

### Changed

- Bumped app and workspace versions to `3.0.0-beta.4`.
- Updated the UI theme to use the logo-inspired graphite and green palette.

## 3.0.0-beta.3

### Added

- Start Menu uninstall shortcut for Windows installs.

### Changed

- Bumped app and workspace versions to `3.0.0-beta.3`.

## 3.0.0-beta.2

### Added

- Desktop window controls for minimize, maximize/restore, and close in the custom title bar.
- Delete progress events and UI status feedback while servers are being removed.
- Template capability API and Settings visibility for the template system foundation.
- Console formatting tests for Minecraft and ANSI color handling.
- README roadmap for future plugin management and template work.

### Changed

- Improved the server settings Java runtime panel with selected runtime details, compatibility guidance, and invalid-selection blocking.
- Improved console responsiveness, scrolling controls, command feedback, copy support, and large-log handling.
- Kept renderer chunk warnings tied to real split output instead of broadly increasing the limit.

### Fixed

- Console commands now use Socket.IO acknowledgements with REST fallback and visible errors.
- ANSI escape codes and Minecraft formatting codes render as safe React segments instead of raw HTML.
- Server deletion now removes server folder contents before metadata cleanup and handles missing folders gracefully.
- External navigation is restricted to HTTPS links.

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
