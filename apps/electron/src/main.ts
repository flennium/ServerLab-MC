import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import { autoUpdater } from "electron-updater";
import crypto from "crypto";

// ─── Startup token (shared secretly with renderer via env var) ────────────────
const BACKEND_TOKEN = crypto.randomBytes(32).toString("hex");
const BACKEND_PORT = 3001;

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;

// ─── Backend lifecycle ────────────────────────────────────────────────────────

function startBackend(): void {
  const backendEntry = isDev
    ? path.join(__dirname, "../../backend/src/index.ts")
    : path.join(process.resourcesPath, "backend/dist/index.js");

  const command = isDev ? "npx" : process.execPath;
  const args = isDev
    ? ["ts-node", backendEntry]
    : [backendEntry];

  backendProcess = spawn(command, args, {
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      BACKEND_TOKEN,
      NODE_ENV: isDev ? "development" : "production",
    },
    stdio: ["pipe", "pipe", "pipe"],
    // Keep child alive only as long as the parent — falls back to tree-kill
    // on non-Windows. On Windows, a Job Object is preferred; see README notes.
    detached: false,
  });

  backendProcess.stdout?.on("data", (chunk: Buffer) => {
    console.log("[backend]", chunk.toString().trim());
  });

  backendProcess.stderr?.on("data", (chunk: Buffer) => {
    console.error("[backend:err]", chunk.toString().trim());
  });

  backendProcess.on("exit", (code, signal) => {
    console.log(`[backend] exited code=${code} signal=${signal}`);
    backendProcess = null;
  });
}

function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill("SIGTERM");
  }
}

// ─── Window creation ──────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f0f0f",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, "../../renderer/dist/index.html")
    );
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the system browser, not inside Electron
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── IPC handlers (renderer → main) ──────────────────────────────────────────

ipcMain.handle("backend:config", () => ({
  origin: `http://127.0.0.1:${BACKEND_PORT}`,
  token: BACKEND_TOKEN,
}));

ipcMain.handle("dialog:openDirectory", async () => {
  const { dialog } = await import("electron");
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("shell:openPath", (_event, filePath: string) => {
  shell.openPath(filePath);
});

ipcMain.handle("app:version", () => app.getVersion());

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on("window-all-closed", () => {
  stopBackend();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopBackend();
});

// Prevent navigation to arbitrary URLs (security hardening)
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (event, url) => {
    const allowedOrigins = ["http://localhost:5173", "file://"];
    const isAllowed = allowedOrigins.some((o) => url.startsWith(o));
    if (!isAllowed) {
      event.preventDefault();
    }
  });
});
