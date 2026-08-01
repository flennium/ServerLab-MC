/**
 * Type declarations for APIs exposed by the Electron preload via contextBridge.
 * These are globally available on `window.serverlab` inside the renderer.
 */
export {};

declare global {
  interface Window {
    serverlab?: {
      getBackendConfig: () => Promise<{ origin: string; token: string }>;
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
