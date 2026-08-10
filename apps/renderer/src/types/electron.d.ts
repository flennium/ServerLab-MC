// Renderer access is limited to the preload bridge defined by Electron.
export {};

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

declare global {
  interface Window {
    serverlab?: {
      getBackendConfig: () => Promise<{ origin: string; token: string }>;
      openDirectoryDialog: () => Promise<string | null>;
      openPath: (path: string) => Promise<void>;
      getAppVersion: () => Promise<string>;
      getDiagnostics: () => Promise<{
        version: string;
        platform: string;
        packaged: boolean;
        backendOrigin: string;
        dataDir: string;
      }>;
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
