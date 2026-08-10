/**
 * ServerLab MC unified dev launcher.
 * Starts backend, waits, starts Vite, waits, compiles Electron, launches Electron.
 *
 * Usage: node scripts/dev.mjs
 */
import { execFile, spawn } from "child_process";
import { createRequire } from "module";
import { createConnection } from "net";
import { fileURLToPath } from "url";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const HOST = "127.0.0.1";
const BACKEND_PORT = 3001;
const RENDERER_PORT = 5173;
const DATA_DIR = path.join(ROOT, "data");
const PROCESS_STATE_PATH = path.join(DATA_DIR, "dev-processes.json");
const SHARED_SRC_DIR = path.join(ROOT, "packages", "shared", "src");

function appEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

const BACKEND_ENV = {
  ...appEnv(),
  PORT: String(BACKEND_PORT),
  DATA_DIR,
  DATABASE_URL: "file:../../../data/serverlab.db",
  NODE_ENV: "development",
};

function nodeTool(command, args) {
  if (command !== "npx") {
    return { command, args };
  }

  const nodeRoot = path.dirname(process.execPath);
  const npxCli = path.join(nodeRoot, "node_modules", "npm", "bin", "npx-cli.js");
  return {
    command: process.execPath,
    args: [npxCli, ...args],
  };
}

function electronCommand() {
  return {
    command: require("electron"),
    args: [path.join(ROOT, "stage")],
  };
}

function spawnProc(command, args, cwd, label, colorCode, env = process.env) {
  const prefix = `\x1b[${colorCode}m[${label}]\x1b[0m `;
  const tool = nodeTool(command, args);
  const proc = spawn(tool.command, tool.args, {
    cwd,
    env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (data) => process.stdout.write(prefix + data));
  proc.stderr.on("data", (data) => process.stderr.write(prefix + data));
  proc.on("error", (error) => {
    console.error(`${prefix}${error.message}`);
  });
  proc.on("exit", (code) => {
    if (code && code !== 0) console.error(`${prefix}exited with code ${code}`);
  });
  return proc;
}

function writeProcessState(children) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    PROCESS_STATE_PATH,
    JSON.stringify(
      {
        repoRoot: ROOT,
        updatedAt: new Date().toISOString(),
        processes: children
          .filter((child) => child?.pid)
          .map((child) => ({ pid: child.pid, startedAt: new Date().toISOString() })),
      },
      null,
      2
    ),
    "utf8"
  );
}

function clearProcessState() {
  fs.rmSync(PROCESS_STATE_PATH, { force: true });
}

function canConnect(port, host = HOST) {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host });
    sock.setTimeout(600);
    sock.on("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => {
      sock.destroy();
      resolve(false);
    });
    sock.on("timeout", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function assertPortFree(port, label) {
  if (!(await canConnect(port))) return;
  const owner = await findPortOwner(port);
  const ownerLine = owner
    ? `Owner: ${owner.processName ?? "unknown"} (${owner.pid})\nCommand: ${owner.commandLine ?? "unknown"}\n`
    : "";
  const looksOwnedByServerLab =
    owner?.commandLine?.includes(ROOT) ||
    owner?.commandLine?.toLowerCase().includes("serverlab") ||
    owner?.commandLine?.toLowerCase().includes("vite");

  throw new Error(
    `${label} port ${port} is already in use.\n` +
      ownerLine +
      (looksOwnedByServerLab
        ? "It looks like an old ServerLab dev process. Run: npm run dev:stop\n"
        : "Close the process using that port, or change the dev port before starting ServerLab.\n")
  );
}

async function findPortOwner(port) {
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"]);
    const line = stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.includes(`:${port} `) && item.includes("LISTENING"));
    const pid = line ? Number(line.split(/\s+/).at(-1)) : NaN;
    if (!Number.isInteger(pid)) return null;
    const command = `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object -First 1 ProcessId,Name,CommandLine | ConvertTo-Json -Compress`;
    const result = await execFileAsync("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ]);
    const parsed = JSON.parse(result.stdout || "{}");
    return {
      pid,
      processName: parsed.Name ?? null,
      commandLine: parsed.CommandLine ?? null,
    };
  } catch {
    return null;
  }
}

function waitForPort(port, host = HOST, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    async function attempt() {
      if (await canConnect(port, host)) {
        resolve();
        return;
      }

      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${host}:${port}`));
        return;
      }

      setTimeout(attempt, 600);
    }

    attempt();
  });
}

function execSync(command, args, cwd, env = process.env) {
  return new Promise((resolve, reject) => {
    const tool = nodeTool(command, args);
    const proc = spawn(tool.command, tool.args, {
      cwd,
      env,
      shell: false,
      stdio: "inherit",
    });
    proc.once("error", reject);
    proc.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    );
  });
}

async function stopChildren(children) {
  const activeChildren = children.filter((child) => child && child.pid && !child.killed);
  if (process.platform === "win32") {
    await Promise.all(
      activeChildren.map(
        (child) =>
          new Promise((resolve) => {
            const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
            });
            killer.once("close", resolve);
            killer.once("error", resolve);
          })
      )
    );
  } else {
    for (const child of activeChildren) child.kill("SIGTERM");
  }
  clearProcessState();
}

function removeStaleSharedSourceOutput() {
  for (const file of fs.readdirSync(SHARED_SRC_DIR)) {
    if (file.endsWith(".js") || file.endsWith(".js.map")) {
      fs.rmSync(path.join(SHARED_SRC_DIR, file), { force: true });
    }
  }
}

async function main() {
  console.log("\x1b[1mServerLab MC - dev mode\x1b[0m\n");

  await assertPortFree(BACKEND_PORT, "Backend");
  await assertPortFree(RENDERER_PORT, "Renderer");

  const children = [];

  try {
    fs.mkdirSync(path.join(DATA_DIR, "backups"), { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, "logs"), { recursive: true });
    removeStaleSharedSourceOutput();

    console.log("Preparing local data directories... ready\n");

    const renderer = spawnProc(
      "npx",
      ["vite", "--host", HOST],
      path.join(ROOT, "apps/renderer"),
      "renderer",
      34,
      appEnv()
    );
    children.push(renderer);
    writeProcessState(children);

    process.stdout.write(`Waiting for Vite (${HOST}:${RENDERER_PORT})... `);
    await waitForPort(RENDERER_PORT);
    console.log("ready\n");

    process.stdout.write("Compiling Electron main process... ");
    await execSync("npx", ["tsc"], path.join(ROOT, "apps/electron"));
    await execSync("node", ["scripts/build-electron-stage.mjs"], ROOT);
    console.log("ready\n");

    console.log("Launching Electron...\n");
    const electronTool = electronCommand();
    const electron = spawnProc(electronTool.command, electronTool.args, ROOT, "electron", 35, appEnv());
    children.push(electron);
    writeProcessState(children);

    process.stdout.write(`Waiting for Electron backend (${HOST}:${BACKEND_PORT})... `);
    await waitForPort(BACKEND_PORT);
    console.log("ready\n");

    electron.on("exit", (code) => {
      console.log("\n[launcher] Electron closed - shutting down all processes");
      void stopChildren(children).finally(() => process.exit(code ?? 0));
    });

    const handleSignal = () => {
      console.log("\n[launcher] Shutdown signal - stopping ServerLab processes");
      void stopChildren(children).finally(() => process.exit(0));
    };
    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
  } catch (error) {
    await stopChildren(children);
    throw error;
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
