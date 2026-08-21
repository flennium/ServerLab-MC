# Changelog

## 3.4.1

### Improved

- Virtualized console logs and server file listings so large workspaces stay responsive.
- Monitor updates now pause when no Monitor view is subscribed and prevent overlapping system scans.
- Electron startup logging, updater settings, and backend shutdown now use safer asynchronous paths.
- Socket and backend configuration initialization now reuse one connection/configuration promise.

### Fixed

- Prevented duplicate Socket.IO clients after temporary backend disconnects.
- Ensured backup, plugin, and server-detail listeners and completion timers are cleaned up when views close.
- Removed unused legacy renderer file-manager components.

### Packaging

- Production packages now use ASAR, include only the English Electron locale, and omit source maps.

### Changed

- Bumped app and workspace versions to `3.4.1`.

## 3.4.0

### Added

- Added dependency review before Modrinth plugin installation, with required dependency downloads and an opt-in choice for optional dependencies.
- Added Modrinth project author information to plugin browsing details.

### Improved

- Dependency names now resolve to Modrinth project titles with safe fallbacks instead of exposing raw identifiers.
- Dependency installation now validates compatibility, avoids duplicates, and detects circular dependency graphs.
- Plugin removal now permanently deletes the plugin jar and ServerLab record after explicit confirmation; the old restore-only trash flow is no longer used.

### Changed

- Bumped app and workspace versions to `3.4.0`.

### Fixed

- Velocity profiles now require Java 25, matching the class version used by current Velocity releases.

## Unreleased

## 3.3.0

### Added

- Added first-class Velocity, Waterfall, and BungeeCord proxy profiles.
- Added official-source proxy downloads, cache reuse, provider build metadata, and legacy warnings for Waterfall and BungeeCord.
- Added proxy-aware Java recommendations, listener bind-address settings, configuration-state warnings, and lifecycle stop commands.
- Added proxy loader compatibility to Modrinth plugin management, including optional target Minecraft version checks.

### Fixed

- Proxy profiles no longer require or generate a Minecraft EULA file or append `nogui` during startup.
- Proxy processes no longer emit Minecraft TPS/world metrics in the Monitor tab.
- Cleared error history no longer reappears when Settings is reopened.
- Error history and port diagnostics now use bounded scrolling regions.

### Changed

- Updated the Server Software Manager table and product documentation for the current supported software.
- Bumped app and workspace versions to `3.3.0`.

## 3.2.0

### Added

- Added official Folia server software support through PaperMC metadata and cached downloads.
- Added official Vanilla server support through Mojang release metadata and SHA-1-verified server jar downloads.
- Vanilla server pages now omit the Plugins tab, and plugin APIs reject unsupported Vanilla operations with a clear explanation.

### Fixed

- Added Mojang's official server artifact host to the download allowlist so Vanilla downloads complete after metadata resolution.
- Extended Java metadata recommendations to Folia servers.

### Changed

- Updated the Server Software Manager documentation and support table to match the current product.
- Removed the outdated Roadmap section from the README.

## 3.1.0

### Added

- Added integrated Spigot support through the official BuildTools workflow.
- Added isolated BuildTools workspaces, real tool-download progress, expandable build logs, cancellation, retry, and stale-job recovery.
- Added BuildTools and locally built Spigot artifact metadata to Software Cache.
- Added JDK, Git, disk-space, cache, and duplicate-build preflight checks.
- Added app-managed portable MinGit downloads so users do not need to install Git manually.

### Fixed

- Spigot is no longer presented as an unavailable direct-download provider.
- BuildTools now receives a private app-managed Git environment and never modifies the system PATH.
- Server creation now rejects incomplete or mismatched Spigot build jobs and reuses valid cached Spigot artifacts.
- Packaged startup now bootstraps the Spigot BuildTools job table on existing installations.
- Existing databases now receive missing BuildTools cache metadata columns automatically.

### Changed

- Bumped app and workspace versions to `3.1.0`.

## 3.0.7

### Added

- Added responsive drag-and-drop and picker-based uploads to the server file manager.
- Added streamed, sandboxed uploads with atomic temporary-file replacement and a 512 MB safety limit.

### Fixed

- Server lifecycle controls now prevent start requests while a server is still stopping and resynchronize the UI after failed requests.
- Corrected process exit status handling so intentionally stopped servers are not incorrectly marked as crashed.
- Plugin installs now refresh the installed inventory immediately and switch back to the Installed view when completed.

### Changed

- Bumped app and workspace versions to `3.0.7`.

## 3.0.6

### Fixed

- Server detail pages now keep the server overview and controls outside the tab content scroll container.
- Files, Console, Plugins, Monitor, Backups, and Settings now share an isolated scroll region without header overlap or duplicate-looking content.
- Server detail layout now fills the available application height without extending the outer page scroll unexpectedly.

### Changed

- Bumped app and workspace versions to `3.0.6`.

## 3.0.5

### Added

- Added explicit uninstall choices for settings, caches, logs, templates, Minecraft servers, and backups.
- Added destructive-action confirmations for server and backup removal.
- Added uninstall audit entries describing each data category kept or removed.

### Fixed

- Updates now preserve all user data without showing uninstall cleanup prompts.

### Changed

- Bumped app and workspace versions to `3.0.5`.

## 3.0.4

### Fixed

- Fixed stable updater release assets so the installer filename in `latest.yml` matches the published GitHub asset.
- Repeated update checks during the short request cooldown now return a normal recent-check state instead of a misleading connection error.
- Cleared stale update cards when a check confirms that no newer stable release is available.
- Made stopping an already-exited server idempotent so shutdown and update flows do not report a false server error.
- Prevented duplicate server names, ignoring case and surrounding whitespace.

### Added

- Displayed server creation dates in the server list and server detail header.
- Made updater release notes include clickable GitHub release and full changelog links.

### Changed

- Bumped app and workspace versions to `3.0.4`.

## 3.0.3

### Fixed

- Stable updater checks now ignore equal or older releases instead of showing the installed version as available.
- Deliberately stopped Minecraft processes now settle on `Stopped` instead of being reported as crashed when Java exits with a non-zero code.
- Sticky server headers now use an opaque stacking layer so console, files, plugins, monitor, backups, and settings content cannot bleed through while scrolling.
- Reduced the console work area height so server management sections remain easier to scan.

### Changed

- Bumped app and workspace versions to `3.0.3`.

## 3.0.2

### Added

- Added installer lifecycle safeguards for update, repair, reset, uninstall, and clean application-data removal workflows.
- Added Settings Troubleshooting actions for opening install/data folders, exporting logs, resetting settings, and clearing software/Java caches.
- Added installer and uninstaller activity logs under the local application data directory.

### Fixed

- Reset and uninstall actions now protect Minecraft servers, backups, templates, and worlds by design.
- Added strict Electron-side validation for reset targets and install-folder access.

### Changed

- Bumped app and workspace versions to `3.0.2`.

## 3.0.1

### Added

- Added a Settings updater panel with stable-channel checks, download progress, release notes, skip-version control, and update recovery actions.
- Added persisted updater preferences for automatic checks, downloads, and installs.
- Added a server-safety gate that requires managed Minecraft servers to stop before installation, with a graceful stop-and-install action.
- Added structured updater diagnostics in `%APPDATA%/ServerLab MC/logs/updater.log` with rotation and prerelease filtering.

### Fixed

- Prerelease and alpha versions are never recommended or installed by the stable updater.
- Update IPC is restricted to typed settings, check, download, install, and progress/error events.

### Changed

- Bumped app and workspace versions to `3.0.1`.

## 3.0.0

### Added

- First stable production release of ServerLab MC.
- Complete local server management workflow for creation, lifecycle control, console, files, plugins, backups, Java runtimes, software cache, ports, and settings.

### Improved

- Refined the dashboard, server management, file manager, console, Java Runtime Center, and plugin workflows for faster everyday operation.
- Added reliable cached software/runtime reuse, real download progress, compatibility guidance, centralized errors, and safer local process/file handling.
- Prepared stable GitHub release publishing and updater metadata for the Windows installer.

### Fixed

- Resolved installation state synchronization, Fabric Java compatibility, port conflicts, file save conflicts, console lifecycle errors, and Modrinth plugin discovery gaps.
- Removed remaining beta-only wording from the active product surface.
- Bumped app and workspace versions to `3.0.0`.

## 3.0.0-beta.19

### Fixed

- Improved Modrinth plugin discovery so projects are no longer hidden just because loader or Minecraft version metadata is incomplete or not yet updated.
- Added paginated Modrinth search results with 40-result pages and a `Load more results` action for lower-ranked and less popular plugins.
- Kept compatibility badges and install safeguards in place so broader discovery does not bypass server compatibility checks.

### Changed

- New plugin searches reset stale project details and select the first result from the current search.
- Added an API-level strict compatibility search option for clients that explicitly need loader and version facets.
- Bumped app and workspace versions to `3.0.0-beta.19`.

## 3.0.0-beta.18

### Changed

- Applied the UI/UX audit across the main operational workflows while keeping the existing operator-console visual language.
- Simplified the Dashboard around active server operations and actionable attention items; removed the secondary resource-stat panel.
- Added server inventory search, status filtering, sorting, and clearer Java/auto-start readiness context.
- Reworked server creation into Basics, Software, Java, Review, and Install stages with visible blockers and install progress.
- Added a restore review surface showing backup date, size, type, location, and safety-backup messaging before overwrite.
- Split the Plugins workspace into Installed and Browse Modrinth modes for faster scanning and fewer competing controls.
- Grouped Settings into General, Storage and support, Roadmap, and Developer tools sections.
- Added `Ctrl+Shift+N` to create a file and `Ctrl+Shift+F` to enable whole-server file search; console output now makes its bounded history explicit.
- Ignored the local UI/UX audit prompt at `/docs/UI-UX-REDESIGN-AUDIT.md` so planning material is not published.
- Bumped app and workspace versions to `3.0.0-beta.18`.

## 3.0.0-beta.17

### Fixed

- Corrected Java compatibility recommendations for Fabric and other providers without upstream Java metadata: Minecraft `1.21.9+` and `26.x` now require Java 25, while earlier `1.21.x` versions remain on Java 21.
- Server startup now returns a clear Java Runtime Center action when the selected runtime is too old, instead of allowing Fabric to fail with `UnsupportedClassVersionError`.
- Made small-file ETags include content hashes so same-size file edits are detected reliably during save conflict checks.

### Changed

- Updated the app and workspace version to `3.0.0-beta.17`.

## 3.0.0-beta.16

### Changed

- Disabled console command entry while a server is stopped, starting, stopping, or crashed, with clear inline guidance instead of a backend failure.
- Improved stopped-server command handling in REST and Socket.IO so packaged builds return a friendly actionable error instead of a generic production message.
- Raised the sticky server management header above tab content to prevent file-manager empty states and breadcrumbs from bleeding over the server overview area.
- Added timed dismissal support for alert banners and applied it to global error toasts, console command errors, Java Runtime Center messages, Settings messages, cache errors, plugin success messages, and backup errors.
- Bumped app and workspace versions to `3.0.0-beta.16`.

## 3.0.0-beta.15

### Added

- Added shared `ManagementHeader`, `ActionBar`, and `DangerZone` UI patterns for consistent page chrome, sticky server controls, and destructive actions.

### Changed

- Normalized dashboard, server inventory, Java Runtime Center, Settings, server detail, and backup layouts around the shared management header/action patterns.
- Moved server deletion out of the everyday lifecycle controls and into a dedicated danger area in server settings.
- Wrapped Java runtime, software cache, and backup destructive actions in consistent danger zones while keeping existing confirmation modals.
- Routed error banners through inline, panel, and toast placements for more predictable error presentation.
- Respected reduced-motion preferences for sidebar transitions, dashboard/server tab transitions, backup progress reveal, and console search navigation/highlights.
- Bumped app and workspace versions to `3.0.0-beta.15`.

## 3.0.0-beta.14

### Added

- Added a collapsible desktop sidebar with icon-only mode, hover tooltips, persisted preference, and a mobile slide-out menu.
- Added opt-in whole-server file search with async backend search, capped results, and visible relative paths.

### Changed

- Simplified the server Files tab by removing Quick Access and filter clutter.
- Reloading an open file now refreshes content in place without closing the editor tab.
- Reduced noisy file warnings and tightened dashboard labels for a cleaner hosting-panel feel.
- Bumped app and workspace versions to `3.0.0-beta.14`.

## 3.0.0-beta.13

### Fixed

- Hardened Windows port ownership lookup so release tests do not hang on slower GitHub runners.
- Increased the occupied-port safety test timeout to match Windows CI timing.
- Bumped app and workspace versions to `3.0.0-beta.13`.

## 3.0.0-beta.12

### Added

- Added the first Modrinth plugin integration slice with backend search, project/version lookup, plugin install jobs, and a per-server Plugins tab.
- Added plugin storage models, install progress events, Modrinth metadata cache, compatibility checks, and install safety tests.
- Added plugin install/update file handling with staging, hash verification, backup, disable, trash, and restore support.

### Changed

- Server file browsing now hides ServerLab-managed plugin internals such as staging, disabled, trash, and backup folders.
- Bumped app and workspace versions to `3.0.0-beta.12`.

## 3.0.0-beta.11

### Added

- Added Ctrl+F console search with match highlighting and previous/next navigation.
- Added a right-click file context menu for open, rename, duplicate, copy path, and delete actions.

### Changed

- Simplified the server Files tab into a cleaner two-column workspace without the File Inspector panel.
- Removed Recent/Favorites file-manager clutter and moved file actions out of row button clusters.
- Polished the Console header, search controls, output rows, and status treatment.
- Bumped app and workspace versions to `3.0.0-beta.11`.

## 3.0.0-beta.10

### Added

- Centralized port management API for checking, suggesting, and listing Minecraft server ports.
- Live port availability UI in server creation and server settings.
- Settings diagnostics panel for backend, Socket.IO, and Minecraft server port status.
- Server process metadata tracking for stale ServerLab-owned process detection.

### Changed

- Server creation, settings updates, and startup now block duplicate or occupied ports before launching Minecraft.
- Server shutdown now waits for managed Minecraft processes to release ports before backend exit.
- Dev startup now reports port owners for blocked development ports instead of showing a blind kill command.
- Bumped app and workspace versions to `3.0.0-beta.10`.

## 3.0.0-beta.9

### Added

- Redesigned the server Files tab into a multi-file workbench with editor tabs, quick access, favorites, recent files, filters, and a file inspector.
- Added richer file metadata, large-file and binary-file protection, stale-save conflict detection, duplicate/export actions, and real folder creation.
- Added Minecraft-aware file validation and restart hints for common server and plugin configuration files.

### Changed

- Files tab state now persists while switching between server sections.
- File operations now use the centralized structured error system.
- Bumped app and workspace versions to `3.0.0-beta.9`.

## 3.0.0-beta.8

### Added

- Centralized structured error model shared across backend, Electron, and renderer.
- Backend error history storage with listing, clearing, and export endpoints.
- Settings Error History section with copy, clear, and log export actions.
- Renderer global error provider with toasts, critical dialogs, inline/banner primitives, and normalization helpers.
- Electron IPC error wrapping and preload methods for reporting errors and exporting logs.

### Changed

- Backend errors now return structured `{ error: AppError }` responses while the renderer remains compatible with legacy string errors.
- API client now converts REST and backend connection failures into user-friendly structured errors.
- Bumped app and workspace versions to `3.0.0-beta.8`.

## 3.0.0-beta.7

### Added

- Managed Java runtime files now appear in the Settings cache section alongside server software cache entries.

### Changed

- Bumped app and workspace versions to `3.0.0-beta.7`.
- Removed template update and community repository roadmap cards from Future Features.
- Improved Server Settings responsiveness for long Java/runtime values and narrow layouts.

### Fixed

- Server creation now returns actionable validation errors for missing or incompatible Java instead of generic production `500` responses.
- Server creation validates Java before downloading and copying server software files.

## 3.0.0-beta.6

### Added

- Dashboard operator view with fleet health, attention items, and local cache/runtime status.
- Developer tools panel in Settings with backend diagnostics, DevTools controls, and copyable connection details.
- Java and software job lookup endpoints for reconnect-safe install/download state recovery.
- Shared renderer job lifecycle helpers with unit coverage.

### Changed

- Bumped app and workspace versions to `3.0.0-beta.6`.
- Improved Java/software install progress handling across Runtime Center and server creation.

### Fixed

- Java installs no longer leave the progress indicator stuck after reaching 100%.
- Terminal install/download errors now keep useful retry context visible instead of being treated like active work.

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
