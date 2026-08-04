import { contextBridge, ipcRenderer } from "electron";
import type { AppErrorCreateInput, ErrorHistoryResponse } from "@serverlab/shared";

// Keep the renderer API small and explicit.

export interface BackendConfig {
  origin: string;
  token: string;
}

export interface AppDiagnostics {
  version: string;
  platform: string;
  packaged: boolean;
  backendOrigin: string;
  dataDir: string;
}

contextBridge.exposeInMainWorld("serverlab", {
  getBackendConfig: (): Promise<BackendConfig> => ipcRenderer.invoke("backend:config"),

  openDirectoryDialog: (): Promise<string | null> =>
    ipcRenderer.invoke("dialog:openDirectory"),

  openPath: (path: string): Promise<void> => ipcRenderer.invoke("shell:openPath", path),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),

  getDiagnostics: (): Promise<AppDiagnostics> => ipcRenderer.invoke("app:diagnostics"),

  getPlatform: (): string => process.platform,

  openDevTools: (): Promise<void> => ipcRenderer.invoke("window:openDevTools"),

  closeDevTools: (): Promise<void> => ipcRenderer.invoke("window:closeDevTools"),

  reportRendererError: (error: AppErrorCreateInput): Promise<unknown> =>
    ipcRenderer.invoke("errors:report", error),

  getErrorHistory: (): Promise<ErrorHistoryResponse> =>
    ipcRenderer.invoke("errors:history"),

  clearErrorHistory: (): Promise<void> => ipcRenderer.invoke("errors:clear"),

  exportLogs: (): Promise<unknown> => ipcRenderer.invoke("logs:export"),

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
      getDiagnostics: () => Promise<AppDiagnostics>;
      getPlatform: () => string;
      openDevTools: () => Promise<void>;
      closeDevTools: () => Promise<void>;
      reportRendererError: (error: AppErrorCreateInput) => Promise<unknown>;
      getErrorHistory: () => Promise<ErrorHistoryResponse>;
      clearErrorHistory: () => Promise<void>;
      exportLogs: () => Promise<unknown>;
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<boolean>;
      closeWindow: () => Promise<void>;
    };
  }
}
