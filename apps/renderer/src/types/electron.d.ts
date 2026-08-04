// Renderer access is limited to the preload bridge defined by Electron.
export {};

import type { AppErrorCreateInput, ErrorHistoryResponse } from "@serverlab/shared";

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
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<boolean>;
      closeWindow: () => Promise<void>;
    };
  }
}
