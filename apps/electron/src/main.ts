import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { createServer } from "net";
import { autoUpdater } from "electron-updater";
import crypto from "crypto";

const BACKEND_TOKEN = crypto.randomBytes(32).toString("hex");
const DEFAULT_BACKEND_PORT = 3001;

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendPort = DEFAULT_BACKEND_PORT;

const isDev = !app.isPackaged;

function getDevRoot(): string {
  const candidates = [path.join(__dirname, ".."), path.join(__dirname, "../../..")];

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

function getDataDir(): string {
  if (isDev) {
    const devDir = path.join(getDevRoot(), "data");
    fs.mkdirSync(devDir, { recursive: true });
    return devDir;
  }
  // app.getPath("userData") = %APPDATA%\ServerLab MC on Windows
  return app.getPath("userData");
}

function writeLaunchLog(message: string): void {
  try {
    const logDir = path.join(getDataDir(), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, "electron-main.log"),
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8"
    );
  } catch {
    // Logging must never block startup.
  }
}

function pathInside(candidate: string, root: string): boolean {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function allowedOpenRoots(): string[] {
  const roots = [getDataDir()];
  const programFiles = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ].filter(Boolean) as string[];

  for (const root of programFiles) {
    roots.push(path.join(root, "Java"));
    roots.push(path.join(root, "Eclipse Adoptium"));
    roots.push(path.join(root, "Microsoft"));
  }

  return roots;
}

function getPrismaQueryEnginePath(): string {
  const clientDir = isDev
    ? path.join(getDevRoot(), "node_modules/.prisma/client")
    : path.join(process.resourcesPath, "backend", "node_modules", ".prisma", "client");

  return path.join(clientDir, "query_engine-windows.dll.node");
}

function getDatabaseUrl(dbPath: string): string {
  if (isDev) {
    return "file:../../../data/serverlab.db";
  }

  return `file:${dbPath}`;
}

function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findBackendPort(): Promise<number> {
  if (isDev) return DEFAULT_BACKEND_PORT;

  for (let port = DEFAULT_BACKEND_PORT; port < DEFAULT_BACKEND_PORT + 20; port += 1) {
    if (await isPortFree(port)) return port;
  }

  throw new Error("No local backend port is available");
}

function startBackend(): void {
  const dataDir = getDataDir();

  fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "java-runtimes"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "software-cache"), { recursive: true });

  const dbPath = path.join(dataDir, "serverlab.db");

  let command: string;
  let args: string[];

  if (isDev) {
    if (process.platform === "win32") {
      command = "cmd.exe";
      args = ["/d", "/s", "/c", "npx tsx src/index.ts"];
    } else {
      command = "npx";
      args = ["tsx", "src/index.ts"];
    }
  } else {
    const bundledNode = path.join(process.resourcesPath, "node", "node.exe");
    command = fs.existsSync(bundledNode) ? bundledNode : process.execPath;
    args = [path.join(process.resourcesPath, "backend", "dist", "index.js")];
  }

  const useElectronAsNode = !isDev && command === process.execPath;
  backendProcess = spawn(command, args, {
    env: {
      ...process.env,
      ...(useElectronAsNode ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      PORT: String(backendPort),
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
    writeLaunchLog(`[backend] ${chunk.toString().trim()}`);
  });

  backendProcess.stderr?.on("data", (chunk: Buffer) => {
    console.error("[backend:err]", chunk.toString().trim());
    writeLaunchLog(`[backend:err] ${chunk.toString().trim()}`);
  });

  backendProcess.on("error", (error) => {
    writeLaunchLog(`[backend:error] ${error.message}`);
  });

  backendProcess.on("exit", (code, signal) => {
    console.log(`[backend] exited code=${code} signal=${signal}`);
    writeLaunchLog(`[backend] exited code=${code} signal=${signal}`);
    backendProcess = null;
  });
}

function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill("SIGTERM");
  }
}

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
  const hasBundledNode = fs.existsSync(bundledNode);
  const nodeCmd = hasBundledNode ? bundledNode : process.execPath;
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
    const proc = spawn(
      nodeCmd,
      [prismaCli, "migrate", "deploy", "--schema", schemaPath],
      {
        env: {
          ...process.env,
          ...(!hasBundledNode ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
          DATABASE_URL: `file:${dbPath}`,
        },
        stdio: "pipe",
      }
    );
    proc.stdout?.on("data", (d: Buffer) => console.log("[migrate]", d.toString().trim()));
    proc.stderr?.on("data", (d: Buffer) =>
      console.log("[migrate:err]", d.toString().trim())
    );
    proc.on("exit", () => resolve());
    proc.on("error", () => resolve());
  });
}

function createWindow(): void {
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
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(process.resourcesPath, "renderer", "index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-fail-load", (_e, errorCode, errorDesc, url) => {
    console.error(`[renderer] Failed to load: ${url} - ${errorCode} ${errorDesc}`);
  });

  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (isDev) {
      console.log(`[renderer:console] ${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("backend:config", () => ({
  origin: `http://127.0.0.1:${backendPort}`,
  token: BACKEND_TOKEN,
}));

ipcMain.handle("dialog:openDirectory", async () => {
  const { dialog } = await import("electron");
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("shell:openPath", async (_event, filePath: string) => {
  const resolved = path.resolve(filePath);
  const allowed = allowedOpenRoots().some((root) => pathInside(resolved, root));
  if (!allowed) {
    throw new Error("Path is outside ServerLab-managed locations");
  }
  await shell.openPath(resolved);
});

ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:toggleMaximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

app.whenReady().then(async () => {
  if (!isDev) {
    await runMigrations();
  }
  backendPort = await findBackendPort();
  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (!isDev) {
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

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (event, url) => {
    const allowedOrigins = ["http://localhost:5173", "file://"];
    const isAllowed = allowedOrigins.some((o) => url.startsWith(o));
    if (!isAllowed) {
      event.preventDefault();
    }
  });
});
