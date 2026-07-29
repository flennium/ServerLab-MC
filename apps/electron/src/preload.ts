import { contextBridge, ipcRenderer } from "electron";

// ─── Whitelisted API surface exposed to the renderer ─────────────────────────
// The renderer accesses this via `window.serverlab.*`
// Nothing from Node / Electron leaks through — contextIsolation: true enforces that.

export interface BackendConfig {
  origin: string;
  token: string;
}

contextBridge.exposeInMainWorld("serverlab", {
  /**
   * Returns the local backend's origin URL and the startup auth token.
   * The renderer attaches the token as an Authorization header on every request.
   */
  getBackendConfig: (): Promise<BackendConfig> =>
    ipcRenderer.invoke("backend:config"),

  /**
   * Opens a native OS folder picker and returns the selected path (or null).
   */
  openDirectoryDialog: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:openDirectory"),
});

// Type augmentation so TypeScript in the renderer knows about window.serverlab
declare global {
  interface Window {
    serverlab: {
      getBackendConfig: () => Promise<BackendConfig>;
      openDirectoryDialog: () => Promise<string | null>;
    };
  }
}
