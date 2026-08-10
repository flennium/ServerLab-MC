# ServerLab MC Advanced Installer Plan

## Goal

Upgrade the Windows Electron installer so ServerLab MC has a professional installation lifecycle with:

- Install
- Update
- Repair
- Reset app data
- Uninstall
- Clean uninstall

The installer must never accidentally delete Minecraft servers, backups, templates, or important user data.

---

## 1. Inspect Current Installer Setup

Before implementation:

- Identify the current Electron packaging system.
- Confirm electron-builder/NSIS configuration.
- Inspect build scripts.
- Inspect current installation paths.
- Inspect AppData and server storage paths.
- Document current install/update/uninstall behavior.

---

## 2. Separate Application Data

Separate application files from user data.

### Application Files

Contains:

- Electron application
- Frontend assets
- Dependencies
- Runtime files

These can be replaced during updates and repairs.

### User Data

Contains:

- Settings
- UI preferences
- Metadata
- Cache
- Logs

### Protected User Content

Never automatically delete:

- Servers
- Backups
- Templates

---

## 3. Existing Installation Detection

Detect existing installations.

Fresh install:

```
Install ServerLab MC
```

Existing install:

```
ServerLab MC is already installed.

[Update]
[Repair]
[Reset App Data]
[Uninstall]
```

---

## 4. Update System

When updating:

- Close ServerLab MC safely.
- Replace application files.
- Preserve user data.
- Preserve servers.
- Preserve backups.
- Preserve templates.
- Run version migrations when required.

Example:

```
Updating ServerLab MC

3.0.0 -> 3.1.0

✓ Application updated
✓ User data preserved
```

---

## 5. Repair Installation

Add a repair option.

Repair should:

- Verify application files.
- Restore missing files.
- Replace corrupted application files.
- Repair shortcuts.
- Restore installation metadata.

Repair must not modify:

- Servers
- Worlds
- Plugins
- Mods
- Backups
- Templates

---

## 6. Reset Application Data

Add a reset option.

Allow users to choose:

```
Reset ServerLab MC

[x] Settings
[x] UI preferences
[x] Cache
[x] Temporary files
[x] Logs

[ ] Templates
[ ] Server metadata
```

Requirements:

- Show confirmation.
- Clearly explain what will be deleted.
- Never delete servers by default.

---

## 7. Uninstall System

Support two uninstall modes.

### Normal Uninstall

Remove:

- Application files
- Shortcuts
- Installer metadata

Keep:

- Servers
- Backups
- Templates

---

### Clean Uninstall

Allow advanced deletion:

```
Clean Uninstall

[x] Application files
[x] Settings
[x] Cache
[x] Logs

[ ] Templates
[ ] Backups
[ ] Minecraft servers
```

Requirements:

- Destructive actions require confirmation.
- Server deletion must never happen accidentally.

---

## 8. Running Process Handling

Before:

- Update
- Repair
- Uninstall

Check if ServerLab MC is running.

Provide:

- Retry
- Close application
- Cancel

Do not silently terminate Minecraft servers.

---

## 9. Installer UI

Keep installer simple.

Fresh installation:

```
Welcome to ServerLab MC

[Install]
```

Existing installation:

```
ServerLab MC

[Update]
[Repair]
[Reset App Data]
[Uninstall]
```

---

## 10. Settings Integration

Add:

```
Settings
└── Troubleshooting
```

Options:

- Repair installation
- Reset application settings
- Clear cache
- Export logs
- Open data directory
- Open installation directory

---

## 11. Logging

Create logs:

```
logs/
 ├── installer.log
 ├── updater.log
 └── uninstall.log
```

Track:

- Install actions
- Update actions
- Repairs
- Data reset actions
- Uninstall actions
- Errors

---

## 12. Migration System

Support version migrations.

Examples:

```
3.0.0 -> 3.1.0
```

Handle:

- Settings changes
- Metadata changes
- Storage changes
- Cache changes

Do not modify Minecraft server files.

---

## 13. Electron Builder / NSIS Integration

If using electron-builder + NSIS:

- Add custom NSIS scripts where needed.
- Keep compatibility with auto updater.
- Avoid unnecessary packaging changes.
- Keep installer logic maintainable.

---

## 14. Safety Requirements

Critical rules:

- Never delete servers automatically.
- Never delete backups automatically.
- Never delete external server folders automatically.
- Confirm destructive actions.
- Keep repair non-destructive.
- Keep updates non-destructive.

---

## 15. Testing

Test:

### Installation
- Fresh install
- Custom directory
- Reinstall

### Updates
- Beta to stable
- Patch updates
- Interrupted updates

### Repair
- Missing files
- Corrupted files

### Reset
- Settings reset
- Cache reset
- Full reset

### Uninstall
- Normal uninstall
- Clean uninstall
- Data preservation

---

## Final Requirements

After implementation:

- Verify no user data loss scenarios.
- Test real installations.
- Verify updater compatibility.
- Update documentation.
- Update changelog.
- Bump application version.
- Commit changes.
- Push changes.

## Implementation Status

The first production-safe installer lifecycle slice is included in ServerLab MC 3.0.2:

- Application files remain replaceable under the Electron installation directory.
- Servers, backups, templates, and worlds remain outside the installer directory and are protected from reset/uninstall actions.
- Settings now includes Troubleshooting actions for opening data and installation folders, exporting logs, resetting settings, and clearing software/Java caches.
- Reset actions validate fixed app-data subdirectories and never accept arbitrary renderer paths.
- The Windows installer records install/update activity in `logs/installer.log`.
- The uninstaller records activity in `logs/uninstall.log`, offers a normal uninstall or removal of application settings/caches/logs, and always preserves servers, backups, and templates.
- Re-running the installer is the supported repair path: electron-builder replaces application files while preserving user data.

Future maintenance work can add a dedicated NSIS maintenance-mode page and migration-specific repair actions without changing the protected-data boundary.
