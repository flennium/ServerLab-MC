import { contextBridge, ipcRenderer } from "electron";

// Keep the renderer API small and explicit.

export interface BackendConfig {
  origin: string;
  token: string;
}

contextBridge.exposeInMainWorld("serverlab", {
  getBackendConfig: (): Promise<BackendConfig> => ipcRenderer.invoke("backend:config"),

  openDirectoryDialog: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:openDirectory"),

  openPath: (path: string): Promise<void> => ipcRenderer.invoke("shell:openPath", path),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),

  getPlatform: (): string => process.platform,

  minimizeWindow: (): Promise<void> => ipcRenderer.invoke("window:minimize"),

  toggleMaximizeWindow: (): Promise<boolean> =>
    ipcRenderer.invoke("window:toggleMaximize"),

  closeWindow: (): Promise<void> => ipcRenderer.invoke("window:close"),
});

// Type augmentation so TypeScript in the renderer knows about window.serverlab
declare global {
  interface Window {
    serverlab: {
      getBackendConfig: () => Promise<BackendConfig>;
      openDirectoryDialog: () => Promise<string | null>;
      openPath: (path: string) => Promise<void>;
      getAppVersion: () => Promise<string>;
      getPlatform: () => string;
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<boolean>;
      closeWindow: () => Promise<void>;
    };
  }
}
