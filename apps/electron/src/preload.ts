import { contextBridge, ipcRenderer } from "electron";
import type {
  AppErrorCreateInput,
  AppUpdateInfo,
  ErrorHistoryResponse,
  UpdateCheckResult,
  UpdateErrorPayload,
  UpdateInstallResult,
  UpdateProgress,
  UpdateSettings,
} from "@serverlab/shared";

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

  openInstallDirectory: (): Promise<void> => ipcRenderer.invoke("app:openInstallDirectory"),

  resetData: (options: {
    settings?: boolean;
    cache?: boolean;
    temporary?: boolean;
    logs?: boolean;
  }): Promise<{ removed: string[] }> => ipcRenderer.invoke("app:resetData", options),

  getPlatform: (): string => process.platform,

  openDevTools: (): Promise<void> => ipcRenderer.invoke("window:openDevTools"),

  closeDevTools: (): Promise<void> => ipcRenderer.invoke("window:closeDevTools"),

  reportRendererError: (error: AppErrorCreateInput): Promise<unknown> =>
    ipcRenderer.invoke("errors:report", error),

  getErrorHistory: (): Promise<ErrorHistoryResponse> =>
    ipcRenderer.invoke("errors:history"),

  clearErrorHistory: (): Promise<void> => ipcRenderer.invoke("errors:clear"),

  exportLogs: (): Promise<unknown> => ipcRenderer.invoke("logs:export"),

  getUpdaterSettings: (): Promise<UpdateSettings> => ipcRenderer.invoke("updater:get-settings"),
  setUpdaterSettings: (settings: Partial<UpdateSettings>): Promise<UpdateSettings> =>
    ipcRenderer.invoke("updater:set-settings", settings),
  checkForUpdates: (): Promise<UpdateCheckResult> => ipcRenderer.invoke("updater:check"),
  downloadUpdate: (): Promise<{ status: "downloading" | "downloaded" }> =>
    ipcRenderer.invoke("updater:download"),
  installUpdate: (): Promise<UpdateInstallResult> => ipcRenderer.invoke("updater:install"),
  stopAndInstallUpdate: (): Promise<UpdateInstallResult> =>
    ipcRenderer.invoke("updater:stop-and-install"),
  skipUpdate: (version: string): Promise<UpdateSettings> =>
    ipcRenderer.invoke("updater:skip", version),
  onUpdaterUpdateAvailable: (handler: (info: AppUpdateInfo) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: AppUpdateInfo) => handler(info);
    ipcRenderer.on("updater:update-available", listener);
    return () => ipcRenderer.removeListener("updater:update-available", listener);
  },
  onUpdaterNotAvailable: (handler: () => void): (() => void) => {
    const listener = () => handler();
    ipcRenderer.on("updater:not-available", listener);
    return () => ipcRenderer.removeListener("updater:not-available", listener);
  },
  onUpdaterProgress: (handler: (progress: UpdateProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: UpdateProgress) => handler(progress);
    ipcRenderer.on("updater:progress", listener);
    return () => ipcRenderer.removeListener("updater:progress", listener);
  },
  onUpdaterDownloaded: (handler: (info: AppUpdateInfo) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: AppUpdateInfo) => handler(info);
    ipcRenderer.on("updater:downloaded", listener);
    return () => ipcRenderer.removeListener("updater:downloaded", listener);
  },
  onUpdaterError: (handler: (error: UpdateErrorPayload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: UpdateErrorPayload) => handler(error);
    ipcRenderer.on("updater:error", listener);
    return () => ipcRenderer.removeListener("updater:error", listener);
  },
  onUpdaterInstallBlocked: (handler: (result: UpdateInstallResult) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, result: UpdateInstallResult) => handler(result);
    ipcRenderer.on("updater:install-blocked", listener);
    return () => ipcRenderer.removeListener("updater:install-blocked", listener);
  },

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
      getUpdaterSettings: () => Promise<UpdateSettings>;
      setUpdaterSettings: (settings: Partial<UpdateSettings>) => Promise<UpdateSettings>;
      checkForUpdates: () => Promise<UpdateCheckResult>;
      downloadUpdate: () => Promise<{ status: "downloading" | "downloaded" }>;
      installUpdate: () => Promise<UpdateInstallResult>;
      stopAndInstallUpdate: () => Promise<UpdateInstallResult>;
      skipUpdate: (version: string) => Promise<UpdateSettings>;
      onUpdaterUpdateAvailable: (handler: (info: AppUpdateInfo) => void) => () => void;
      onUpdaterProgress: (handler: (progress: UpdateProgress) => void) => () => void;
      onUpdaterDownloaded: (handler: (info: AppUpdateInfo) => void) => () => void;
      onUpdaterError: (handler: (error: UpdateErrorPayload) => void) => () => void;
      onUpdaterInstallBlocked: (handler: (result: UpdateInstallResult) => void) => () => void;
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<boolean>;
      closeWindow: () => Promise<void>;
    };
  }
}
