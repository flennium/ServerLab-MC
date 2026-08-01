# Security

ServerLab MC is a local-first desktop application. The Electron main process starts a backend bound to `127.0.0.1` and shares a per-launch token with the renderer through the preload bridge.

## Local Backend

- REST API requests require the startup token except for health checks.
- Socket.IO connections require the same startup token.
- The backend is not intended to be exposed to a network.

## Downloads

- Java runtimes and server software must use HTTPS.
- Provider downloads are restricted to approved provider-owned hosts.
- Downloaded server jars and runtimes are verified when provider metadata includes checksums or sizes.
- Downloaded jars are copied into server folders and are not executed during installation.

## Filesystem Access

- Renderer filesystem access goes through explicit preload IPC.
- Server file operations are sandboxed to each server root.
- Managed Java runtimes and software cache are stored in the app data directory.

## Reporting Issues

Open a private security advisory or contact the maintainer before publishing details for a suspected vulnerability.

