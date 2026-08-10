import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { createServer } from "net";
import http from "http";
import { autoUpdater } from "electron-updater";
import crypto from "crypto";
import type {
  AppError,
  AppErrorCategory,
  AppErrorSeverity,
  AppUpdateInfo,
  UpdateCheckResult,
  UpdateErrorPayload,
  UpdateInstallResult,
  UpdateProgress,
  UpdateSettings,
} from "@serverlab/shared";
import type { ProgressInfo, UpdateInfo as ElectronUpdateInfo } from "electron-updater";

const BACKEND_TOKEN = crypto.randomBytes(32).toString("hex");
const DEFAULT_BACKEND_PORT = 3001;

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendPort = DEFAULT_BACKEND_PORT;
let updateSettings: UpdateSettings = {
  autoCheck: true,
  autoDownload: false,
  autoInstall: false,
  skippedVersion: null,
  lastCheckedAt: null,
};
let lastUpdateCheckAt = 0;
let latestUpdate: AppUpdateInfo | null = null;
let updateTimer: NodeJS.Timeout | null = null;

const isDev = !app.isPackaged;
const allowMultipleInstances = isDev && process.env.SERVERLAB_ALLOW_MULTI_INSTANCE === "1";
const hasSingleInstanceLock = allowMultipleInstances || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
  app.exit(0);
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

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

function createElectronError(input: {
  category?: AppErrorCategory;
  severity?: AppErrorSeverity;
  userMessage: string;
  technicalDetails?: string | null;
  possibleSolution?: string | null;
  source?: string;
  action?: string;
}): AppError {
  return {
    id: crypto.randomUUID(),
    category: input.category ?? "electron",
    severity: input.severity ?? "error",
    userMessage: input.userMessage,
    technicalDetails: input.technicalDetails ?? null,
    possibleSolution: input.possibleSolution ?? null,
    timestamp: new Date().toISOString(),
    source: input.source ?? "electron:main",
    action: input.action ?? "ipc",
    causeId: null,
    recoveries: ["copy-details", "open-logs", "dismiss"],
  };
}

function ipcError(error: unknown, action: string): Error {
  const appError =
    typeof error === "object" &&
    error !== null &&
    "userMessage" in error &&
    "id" in error
      ? (error as AppError)
      : createElectronError({
          category: "ipc",
          severity: "error",
          userMessage: error instanceof Error ? error.message : "Electron action failed.",
          technicalDetails: error instanceof Error ? error.stack ?? error.message : String(error),
          possibleSolution: "Try the action again. If it keeps failing, copy diagnostics.",
          action,
        });
  writeLaunchLog(`[ipc:error] ${appError.action} ${appError.userMessage}`);
  return new Error(JSON.stringify(appError));
}

function safeIpcHandler<T, Args extends unknown[]>(
  channel: string,
  handler: (...args: Args) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await handler(...(args as Args));
    } catch (error) {
      throw ipcError(error, channel);
    }
  });
}

function backendJson<T>(
  pathName: string,
  init: { method?: string; body?: string } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: backendPort,
        path: pathName,
        method: init.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${BACKEND_TOKEN}`,
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`Backend request failed with HTTP ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

function pathInside(candidate: string, root: string): boolean {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function allowedOpenRoots(): string[] {
  const roots = [getDataDir()];
  roots.push(isDev ? getDevRoot() : path.dirname(process.execPath));
  roots.push(process.resourcesPath);
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

type ResetDataOptions = {
  settings?: boolean;
  cache?: boolean;
  temporary?: boolean;
  logs?: boolean;
};

function resetDataDirectories(input: ResetDataOptions): string[] {
  const dataDir = getDataDir();
  const removed: string[] = [];
  const targets: Array<[keyof ResetDataOptions, string[]]> = [
    ["settings", ["settings"]],
    ["cache", ["software-cache", "java-runtimes"]],
    ["logs", ["logs"]],
  ];

  for (const [option, directories] of targets) {
    if (!input[option]) continue;
    for (const directory of directories) {
      const target = path.join(dataDir, directory);
      if (!pathInside(target, dataDir) || target === dataDir) {
        throw new Error(`Refusing to reset unsafe data path: ${target}`);
      }
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(target, { recursive: true });
      removed.push(directory);
    }
  }

  if (input.temporary) {
    for (const directory of ["software-cache/tmp", "java-runtimes/tmp"]) {
      const target = path.join(dataDir, directory);
      if (!pathInside(target, dataDir)) {
        throw new Error(`Refusing to reset unsafe temporary path: ${target}`);
      }
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(target, { recursive: true });
      removed.push(directory);
    }
  }

  return removed;
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

  const checked: number[] = [];
  for (let port = DEFAULT_BACKEND_PORT; port < DEFAULT_BACKEND_PORT + 20; port += 1) {
    checked.push(port);
    if (await isPortFree(port)) return port;
  }

  throw new Error(
    `No local backend port is available. Checked ${checked[0]}-${checked.at(-1)}. Close another ServerLab instance or the process using those ports.`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function updaterSettingsPath(): string {
  return path.join(getDataDir(), "settings", "updater.json");
}

function writeUpdaterLog(event: string, details: Record<string, unknown> = {}): void {
  try {
    const logDir = path.join(getDataDir(), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, "updater.log");
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 5 * 1024 * 1024) {
      for (let index = 2; index >= 1; index -= 1) {
        const source = index === 1 ? logPath : `${logPath}.${index - 1}`;
        const target = `${logPath}.${index}`;
        if (fs.existsSync(source)) fs.renameSync(source, target);
      }
    }
    fs.appendFileSync(
      logPath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...details })}\n`,
      "utf8"
    );
  } catch {
    // Update diagnostics must never prevent the app from running.
  }
}

function loadUpdaterSettings(): void {
  try {
    const parsed = JSON.parse(fs.readFileSync(updaterSettingsPath(), "utf8")) as Partial<UpdateSettings>;
    updateSettings = {
      ...updateSettings,
      autoCheck: parsed.autoCheck !== false,
      autoDownload: parsed.autoDownload === true,
      autoInstall: parsed.autoInstall === true,
      skippedVersion: typeof parsed.skippedVersion === "string" ? parsed.skippedVersion : null,
      lastCheckedAt: typeof parsed.lastCheckedAt === "string" ? parsed.lastCheckedAt : null,
    };
  } catch {
    // Missing or invalid settings use the safe defaults.
  }
}

function saveUpdaterSettings(): void {
  const settingsPath = updaterSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(updateSettings, null, 2), "utf8");
}

function sendUpdaterEvent(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(`updater:${channel}`, payload);
}

function safeReleaseNotes(value: unknown): string | null {
  if (typeof value === "string") {
    return value.replace(/<[^>]*>/g, "").trim().slice(0, 12_000) || null;
  }
  if (Array.isArray(value)) {
    const notes = value
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "note" in entry) {
          return String((entry as { note?: unknown }).note ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
    return safeReleaseNotes(notes);
  }
  return null;
}

function normalizeUpdateInfo(info: ElectronUpdateInfo): AppUpdateInfo {
  const downloadSize = info.files?.reduce((total, file) => total + (file.size ?? 0), 0) || null;
  return {
    version: info.version,
    releaseUrl: `https://github.com/flennium/ServerLab-MC/releases/tag/v${info.version}`,
    releaseDate: info.releaseDate ?? null,
    releaseNotes: safeReleaseNotes(info.releaseNotes),
    downloadSize,
    mandatory: false,
    minSupportedVersion: null,
  };
}

async function loadUpdatePolicy(version: string): Promise<Pick<AppUpdateInfo, "mandatory" | "minSupportedVersion">> {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    return { mandatory: false, minSupportedVersion: null };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      `https://github.com/flennium/ServerLab-MC/releases/download/v${version}/update-meta.json`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    if (!response.ok) return { mandatory: false, minSupportedVersion: null };
    const metadata = (await response.json()) as {
      mandatory?: unknown;
      minSupportedVersion?: unknown;
    };
    return {
      mandatory: metadata.mandatory === true,
      minSupportedVersion:
        typeof metadata.minSupportedVersion === "string" ? metadata.minSupportedVersion : null,
    };
  } catch {
    return { mandatory: false, minSupportedVersion: null };
  } finally {
    clearTimeout(timeout);
  }
}

function isPrereleaseVersion(version: string): boolean {
  return /-/.test(version);
}

function stableVersionParts(version: string): [number, number, number] | null {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isNewerStableVersion(candidate: string, current: string): boolean {
  const next = stableVersionParts(candidate);
  const installed = stableVersionParts(current);
  if (!next || !installed) return false;
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

function normalizeUpdateProgress(progress: ProgressInfo): UpdateProgress {
  return {
    percent: Number.isFinite(progress.percent) ? progress.percent : 0,
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  };
}

function updaterErrorPayload(error: unknown): UpdateErrorPayload {
  const message = error instanceof Error ? error.message : String(error);
  return {
    message: "ServerLab could not complete the update.",
    technicalDetails: message,
  };
}

function setupUpdater(): void {
  if (isDev) return;
  loadUpdaterSettings();
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("update-available", (info) => {
    if (isPrereleaseVersion(info.version)) {
      writeUpdaterLog("prerelease-skipped", { version: info.version });
      return;
    }
    if (!isNewerStableVersion(info.version, app.getVersion())) {
      latestUpdate = null;
      writeUpdaterLog("same-or-older-version-skipped", {
        currentVersion: app.getVersion(),
        version: info.version,
      });
      sendUpdaterEvent("not-available", { checkedAt: updateSettings.lastCheckedAt });
      return;
    }
    void loadUpdatePolicy(info.version).then((policy) => {
      latestUpdate = { ...normalizeUpdateInfo(info), ...policy };
      if (updateSettings.skippedVersion === latestUpdate.version && !latestUpdate.mandatory) {
        writeUpdaterLog("update-skipped", { version: latestUpdate.version });
        return;
      }
      writeUpdaterLog("update-available", { version: latestUpdate?.version, mandatory: latestUpdate?.mandatory });
      sendUpdaterEvent("update-available", latestUpdate);
      if (updateSettings.autoDownload) void downloadUpdate();
    });
  });
  autoUpdater.on("update-not-available", () => {
    writeUpdaterLog("update-not-available", { currentVersion: app.getVersion() });
    sendUpdaterEvent("not-available", { checkedAt: updateSettings.lastCheckedAt });
  });
  autoUpdater.on("download-progress", (progress) => {
    sendUpdaterEvent("progress", normalizeUpdateProgress(progress));
  });
  autoUpdater.on("update-downloaded", (info) => {
    if (!isNewerStableVersion(info.version, app.getVersion())) {
      writeUpdaterLog("downloaded-version-skipped", {
        currentVersion: app.getVersion(),
        version: info.version,
      });
      return;
    }
    latestUpdate = normalizeUpdateInfo(info);
    writeUpdaterLog("update-downloaded", { version: latestUpdate.version });
    sendUpdaterEvent("downloaded", latestUpdate);
    if (updateSettings.autoInstall) {
      void installUpdate(false).then((result) => {
        if (result.status === "blocked") sendUpdaterEvent("install-blocked", result);
      }).catch(reportUpdaterError);
    }
  });
  autoUpdater.on("error", (error) => {
    reportUpdaterError(error);
  });
}

function reportUpdaterError(error: unknown): void {
  const payload = updaterErrorPayload(error);
  writeUpdaterLog("error", { details: payload.technicalDetails });
  sendUpdaterEvent("error", payload);
}

async function checkForUpdates(): Promise<UpdateCheckResult> {
  if (isDev) return { status: "not-available", info: null };
  if (Date.now() - lastUpdateCheckAt < 60_000) {
    writeUpdaterLog("check-skipped-cooldown", {
      currentVersion: app.getVersion(),
      lastCheckedAt: updateSettings.lastCheckedAt,
    });
    return { status: "not-available", info: null };
  }
  lastUpdateCheckAt = Date.now();
  updateSettings.lastCheckedAt = new Date().toISOString();
  saveUpdaterSettings();
  sendUpdaterEvent("checking", { checkedAt: updateSettings.lastCheckedAt });
  writeUpdaterLog("check-start", { currentVersion: app.getVersion() });
  const result = await autoUpdater.checkForUpdates();
  if (
    !result?.updateInfo ||
    isPrereleaseVersion(result.updateInfo.version) ||
    !isNewerStableVersion(result.updateInfo.version, app.getVersion())
  ) {
    return { status: "not-available", info: null };
  }
  latestUpdate = normalizeUpdateInfo(result.updateInfo);
  return { status: "available", info: latestUpdate };
}

async function downloadUpdate(): Promise<{ status: "downloading" | "downloaded" }> {
  await autoUpdater.downloadUpdate();
  return { status: "downloaded" };
}

interface BackendServerSummary {
  id: string;
  name: string;
  status: string;
}

async function getRunningServers(): Promise<BackendServerSummary[]> {
  const response = await backendJson<{ servers: BackendServerSummary[] }>("/api/servers");
  return response.servers.filter((server) =>
    ["running", "starting", "stopping"].includes(server.status)
  );
}

async function installUpdate(stopRunningServers: boolean): Promise<UpdateInstallResult> {
  const runningServers = await getRunningServers();
  if (runningServers.length > 0 && !stopRunningServers) {
    return {
      status: "blocked",
      runningServers: runningServers.map(({ id, name }) => ({ id, name })),
    };
  }

  if (runningServers.length > 0) {
    for (const server of runningServers) {
      await backendJson(`/api/servers/${encodeURIComponent(server.id)}/stop`, { method: "POST" });
    }
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if ((await getRunningServers()).length === 0) break;
      await sleep(500);
    }
    if ((await getRunningServers()).length > 0) {
      throw new Error("Managed Minecraft servers did not stop within 30 seconds.");
    }
  }

  writeUpdaterLog("install", { version: latestUpdate?.version ?? null });
  autoUpdater.quitAndInstall(false, true);
  return { status: "ready" };
}

function scheduleUpdaterCheck(): void {
  if (isDev) return;
  if (updateTimer) clearTimeout(updateTimer);
  const sixHours = 6 * 60 * 60 * 1000;
  const jitter = Math.floor(Math.random() * 15 * 60 * 1000);
  updateTimer = setTimeout(() => {
    if (updateSettings.autoCheck) {
      void checkForUpdates().catch(reportUpdaterError);
    }
    scheduleUpdaterCheck();
  }, sixHours + jitter);
}

function checkBackendHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ready);
    };

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: backendPort,
        path: "/health",
        method: "GET",
        timeout: 1000,
        headers: {
          Authorization: `Bearer ${BACKEND_TOKEN}`,
        },
      },
      (res) => {
        res.resume();
        finish(res.statusCode === 200);
      }
    );

    req.on("timeout", () => {
      req.destroy();
      finish(false);
    });
    req.on("error", () => finish(false));
    req.end();
  });
}

async function waitForBackend(timeoutMs = 30000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!backendProcess) {
      throw new Error("Backend process exited before it became ready");
    }

    if (await checkBackendHealth()) {
      writeLaunchLog(`[main] backend ready on 127.0.0.1:${backendPort}`);
      return;
    }

    await sleep(250);
  }

  throw new Error(`Backend did not become ready within ${timeoutMs}ms`);
}

function startBackend(): void {
  const dataDir = getDataDir();

  fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "servers"), { recursive: true });
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
  writeLaunchLog(
    `[main] starting backend command="${command}" port=${backendPort} dataDir="${dataDir}"`
  );
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

safeIpcHandler("backend:config", () => ({
  origin: `http://127.0.0.1:${backendPort}`,
  token: BACKEND_TOKEN,
}));

safeIpcHandler("dialog:openDirectory", async () => {
  const { dialog } = await import("electron");
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

safeIpcHandler("shell:openPath", async (filePath: string) => {
  const resolved = path.resolve(filePath);
  const allowed = allowedOpenRoots().some((root) => pathInside(resolved, root));
  if (!allowed) {
    throw createElectronError({
      category: "file",
      severity: "warning",
      userMessage: "ServerLab cannot open that location.",
      technicalDetails: `Rejected path: ${resolved}`,
      possibleSolution: "Open a folder managed by ServerLab or choose a server folder first.",
      action: "open-path",
      source: "electron:ipc",
    });
  }
  await shell.openPath(resolved);
});

safeIpcHandler("app:version", () => app.getVersion());

safeIpcHandler("app:diagnostics", () => ({
  version: app.getVersion(),
  platform: process.platform,
  packaged: app.isPackaged,
  backendOrigin: `http://127.0.0.1:${backendPort}`,
  dataDir: getDataDir(),
}));

safeIpcHandler("app:openInstallDirectory", async () => {
  const installDirectory = isDev ? getDevRoot() : path.dirname(process.execPath);
  const error = await shell.openPath(installDirectory);
  if (error) throw new Error(error);
});

safeIpcHandler("app:resetData", (input: ResetDataOptions) => {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid reset options.");
  }

  for (const key of ["settings", "cache", "temporary", "logs"] as const) {
    if (key in input && typeof input[key] !== "boolean") {
      throw new Error(`Invalid reset option: ${key}.`);
    }
  }

  const removed = resetDataDirectories(input);
  writeLaunchLog(`[data] reset directories=${removed.join(",") || "none"}`);
  return { removed };
});

safeIpcHandler("errors:report", async (error) =>
  backendJson("/api/errors", {
    method: "POST",
    body: JSON.stringify(error),
  }).catch(() => ({ error }))
);

safeIpcHandler("errors:history", async () =>
  backendJson("/api/errors?limit=100&includeCleared=true")
);

safeIpcHandler("errors:clear", async () =>
  backendJson("/api/errors/clear", { method: "POST" })
);

safeIpcHandler("logs:export", async () => backendJson("/api/logs/export"));

safeIpcHandler("updater:get-settings", () => updateSettings);

safeIpcHandler("updater:set-settings", (input: Partial<UpdateSettings>) => {
  if (typeof input !== "object" || input === null) {
    throw new Error("Invalid updater settings.");
  }
  if ("autoCheck" in input && typeof input.autoCheck !== "boolean") {
    throw new Error("Invalid automatic update setting.");
  }
  if ("autoDownload" in input && typeof input.autoDownload !== "boolean") {
    throw new Error("Invalid automatic download setting.");
  }
  if ("autoInstall" in input && typeof input.autoInstall !== "boolean") {
    throw new Error("Invalid automatic install setting.");
  }
  if ("skippedVersion" in input && input.skippedVersion !== null && typeof input.skippedVersion !== "string") {
    throw new Error("Invalid skipped update version.");
  }
  updateSettings = { ...updateSettings, ...input };
  saveUpdaterSettings();
  return updateSettings;
});

safeIpcHandler("updater:check", () => checkForUpdates());
safeIpcHandler("updater:download", () => downloadUpdate());
safeIpcHandler("updater:install", () => installUpdate(false));
safeIpcHandler("updater:stop-and-install", () => installUpdate(true));
safeIpcHandler("updater:skip", (version: string) => {
  if (typeof version !== "string" || !version.trim()) throw new Error("Invalid update version.");
  updateSettings.skippedVersion = version.trim();
  saveUpdaterSettings();
  return updateSettings;
});

safeIpcHandler("window:openDevTools", () => {
  mainWindow?.webContents.openDevTools({ mode: "detach" });
});

safeIpcHandler("window:closeDevTools", () => {
  mainWindow?.webContents.closeDevTools();
});

safeIpcHandler("window:minimize", () => {
  mainWindow?.minimize();
});

safeIpcHandler("window:toggleMaximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return mainWindow.isMaximized();
});

safeIpcHandler("window:close", () => {
  mainWindow?.close();
});

app.whenReady().then(async () => {
  writeLaunchLog(
    `[main] app ready packaged=${app.isPackaged} version=${app.getVersion()} userData="${getDataDir()}"`
  );

  if (!isDev) {
    await runMigrations();
  }
  backendPort = await findBackendPort();
  writeLaunchLog(`[main] selected backend port ${backendPort}`);
  startBackend();

  try {
    await waitForBackend();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backend startup error";
    writeLaunchLog(`[main:error] ${message}`);
    if (!isDev) {
      dialog.showErrorBox(
        "ServerLab backend failed to start",
        `${message}\n\nCheck the startup log in ${path.join(getDataDir(), "logs", "electron-main.log")}.`
      );
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (!isDev) {
    setupUpdater();
    setTimeout(() => {
      if (updateSettings.autoCheck) {
        void checkForUpdates().catch(reportUpdaterError);
      }
    }, 5_000);
    scheduleUpdaterCheck();
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
