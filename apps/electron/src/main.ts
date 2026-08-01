import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { autoUpdater } from "electron-updater";
import crypto from "crypto";

// ─── Startup token ────────────────────────────────────────────────────────────
const BACKEND_TOKEN = crypto.randomBytes(32).toString("hex");
const BACKEND_PORT = 3001;

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;

function getDevRoot(): string {
  const candidates = [
    path.join(__dirname, ".."),
    path.join(__dirname, "../../.."),
  ];

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "package.json")) &&
      fs.existsSync(path.join(candidate, "apps", "backend"))
    ) {
      return candidate;
    }
  }

  return path.join(__dirname, "../../..");
}

/**
 * The single source of truth for where all persistent app data lives.
 *
 * Dev:        <project>/data/   (keeps dev data out of the source tree)
 * Production: %APPDATA%\ServerLab MC\   (standard Windows userData path)
 *
 * Structure:
 *   <DATA_DIR>/
 *     serverlab.db         ← SQLite database
 *     backups/             ← zip archives
 *     logs/                ← app-level logs
 */
function getDataDir(): string {
  if (isDev) {
    const devDir = path.join(getDevRoot(), "data");
    fs.mkdirSync(devDir, { recursive: true });
    return devDir;
  }
  // app.getPath("userData") = %APPDATA%\ServerLab MC on Windows
  return app.getPath("userData");
}

function getPrismaQueryEnginePath(): string {
  const clientDir = isDev
    ? path.join(getDevRoot(), "node_modules/.prisma/client")
    : path.join(
        process.resourcesPath,
        "backend",
        "node_modules",
        ".prisma",
        "client"
      );

  return path.join(clientDir, "query_engine-windows.dll.node");
}

function getDatabaseUrl(dbPath: string): string {
  if (isDev) {
    return "file:../../../data/serverlab.db";
  }

  return `file:${dbPath}`;
}

// ─── Backend lifecycle ────────────────────────────────────────────────────────

function startBackend(): void {
  const dataDir = getDataDir();

  // Ensure sub-directories exist before the backend starts
  fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });

  const dbPath = path.join(dataDir, "serverlab.db");

  let command: string;
  let args: string[];

  if (isDev) {
    // Dev: use tsx to run TypeScript directly
    if (process.platform === "win32") {
      command = "cmd.exe";
      args = ["/d", "/s", "/c", "npx tsx src/index.ts"];
    } else {
      command = "npx";
      args = ["tsx", "src/index.ts"];
    }
  } else {
    // Production: run the pre-bundled index.js with Node.
    // Electron ships its own Node runtime at process.execPath,
    // but that's the Electron binary. We use a separate node.exe
    // that electron-builder extracts to resources, falling back to
    // the system node if not found.
    const bundledNode = path.join(process.resourcesPath, "node", "node.exe");
    const systemNode = "node";
    command = fs.existsSync(bundledNode) ? bundledNode : systemNode;
    args = [
      path.join(process.resourcesPath, "backend", "dist", "index.js"),
    ];
  }

  backendProcess = spawn(command, args, {
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      BACKEND_TOKEN,
      NODE_ENV: isDev ? "development" : "production",
      DATA_DIR: dataDir,
      DATABASE_URL: getDatabaseUrl(dbPath),
      PRISMA_QUERY_ENGINE_LIBRARY: getPrismaQueryEnginePath(),
    },
    cwd: isDev ? path.join(getDevRoot(), "apps/backend") : undefined,
    stdio: ["pipe", "pipe", "pipe"],
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

// ─── DB migrations (production first-launch) ─────────────────────────────────

async function runMigrations(): Promise<void> {
  const dataDir = getDataDir();
  const dbPath = path.join(dataDir, "serverlab.db");
  const schemaPath = path.join(
    process.resourcesPath,
    "backend",
    "dist",
    "prisma",
    "schema.prisma"
  );
  const bundledNode = path.join(process.resourcesPath, "node", "node.exe");
  const nodeCmd = fs.existsSync(bundledNode) ? bundledNode : "node";
  const prismaCli = path.join(
    process.resourcesPath,
    "backend",
    "node_modules",
    ".bin",
    "prisma"
  );

  if (!fs.existsSync(prismaCli)) {
    console.log("[migrations] prisma CLI not found, skipping");
    return;
  }

  return new Promise((resolve) => {
    const proc = spawn(nodeCmd, [prismaCli, "migrate", "deploy", "--schema", schemaPath], {
      env: {
        ...process.env,
        DATABASE_URL: `file:${dbPath}`,
      },
      stdio: "pipe",
    });
    proc.stdout?.on("data", (d: Buffer) => console.log("[migrate]", d.toString().trim()));
    proc.stderr?.on("data", (d: Buffer) => console.log("[migrate:err]", d.toString().trim()));
    proc.on("exit", () => resolve());
    proc.on("error", () => resolve()); // Don't block app start if migration fails
  });
}

// ─── Window creation ──────────────────────────────────────────────────────────

function createWindow(): void {
  // In production the asar is extracted to a temp path when accessed via __dirname.
  // app.getAppPath() always returns the real path to the app directory.
  const preloadPath = app.isPackaged
    ? path.join(app.getAppPath(), "preload.js")
    : path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0f0f0f",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // must be false when using contextBridge with preload
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(process.resourcesPath, "renderer", "index.html")
    );
    // Open DevTools in production temporarily for debugging
    // Remove this before final release
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Log load failures for debugging
  mainWindow.webContents.on("did-fail-load", (_e, errorCode, errorDesc, url) => {
    console.error(`[renderer] Failed to load: ${url} — ${errorCode} ${errorDesc}`);
  });

  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    console.log(`[renderer:console] ${message} (${sourceId}:${line})`);
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

app.whenReady().then(async () => {
  // Run DB migrations on first launch (production only)
  if (!isDev) {
    await runMigrations();
  }
  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (!isDev) {
    // Auto-update check — wrapped in try/catch so a missing update server
    // never crashes the app
    try {
      autoUpdater.checkForUpdatesAndNotify();
    } catch {
      // ignore
    }
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
