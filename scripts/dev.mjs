/**
 * ServerLab MC unified dev launcher.
 * Starts backend, waits, starts Vite, waits, compiles Electron, launches Electron.
 *
 * Usage: node scripts/dev.mjs
 */
import { spawn } from "child_process";
import { createRequire } from "module";
import { createConnection } from "net";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const require = createRequire(import.meta.url);
const HOST = "127.0.0.1";
const BACKEND_PORT = 3001;
const RENDERER_PORT = 5173;
const DATA_DIR = path.join(ROOT, "data");
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

  throw new Error(
    `${label} port ${port} is already in use.\n` +
      `Close the old ServerLab/dev process or run:\n` +
      `  Get-NetTCPConnection -LocalPort ${port} | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }\n`
  );
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
    proc.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    );
  });
}

function shutdown(children) {
  for (const child of children) {
    if (child && !child.killed) child.kill("SIGTERM");
  }
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

  process.stdout.write(`Waiting for Electron backend (${HOST}:${BACKEND_PORT})... `);
  await waitForPort(BACKEND_PORT);
  console.log("ready\n");

  electron.on("exit", () => {
    console.log("\n[launcher] Electron closed - shutting down all processes");
    shutdown(children);
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("\n[launcher] SIGINT - shutting down");
    shutdown(children);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
