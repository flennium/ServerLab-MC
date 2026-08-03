// Renderer access is limited to the preload bridge defined by Electron.
export {};

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
      minimizeWindow: () => Promise<void>;
      toggleMaximizeWindow: () => Promise<boolean>;
      closeWindow: () => Promise<void>;
    };
  }
}
