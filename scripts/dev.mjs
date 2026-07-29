/**
 * ServerLab MC — unified dev launcher
 * Starts backend → waits → starts Vite → waits → compiles Electron → launches Electron.
 *
 * Usage:  node scripts/dev.mjs
 */
import { spawn } from "child_process";
import { createConnection } from "net";
import { fileURLToPath } from "url";
import path from "path";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function spawnProc(cmd, args, cwd, label, colorCode) {
  const prefix = `\x1b[${colorCode}m[${label}]\x1b[0m `;
  const proc = spawn(cmd, args, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", (d) => process.stdout.write(prefix + d));
  proc.stderr.on("data", (d) => process.stderr.write(prefix + d));
  proc.on("exit", (code) => {
    if (code && code !== 0) console.error(`${prefix}exited with code ${code}`);
  });
  return proc;
}

function waitForPort(port, host = "127.0.0.1", timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      const sock = createConnection({ port, host });
      sock.setTimeout(600);
      sock.on("connect", () => { sock.destroy(); resolve(); });
      sock.on("error", () => {
        sock.destroy();
        if (Date.now() > deadline) return reject(new Error(`Timed out waiting for ${host}:${port}`));
        setTimeout(attempt, 600);
      });
      sock.on("timeout", () => { sock.destroy(); setTimeout(attempt, 600); });
    }
    attempt();
  });
}

function execSync(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, shell: true, stdio: "inherit" });
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\x1b[1m⬡  ServerLab MC — dev mode\x1b[0m\n");

  // 1. Backend
  const backend = spawnProc("npx", ["tsx", "src/index.ts"], path.join(ROOT, "apps/backend"), "backend", 32);
  process.stdout.write("⏳ Waiting for backend (port 3001)… ");
  await waitForPort(3001);
  console.log("✅\n");

  // 2. Vite renderer
  const renderer = spawnProc("npx", ["vite"], path.join(ROOT, "apps/renderer"), "renderer", 34);
  process.stdout.write("⏳ Waiting for Vite (port 5173)… ");
  await waitForPort(5173);
  console.log("✅\n");

  // 3. Compile Electron main process
  process.stdout.write("🔨 Compiling Electron main process… ");
  await execSync("npx", ["tsc"], path.join(ROOT, "apps/electron"));
  console.log("✅\n");

  // 4. Launch Electron
  console.log("🚀 Launching Electron…\n");
  const electron = spawnProc(
    "npx",
    ["electron", path.join(ROOT, "apps/electron/dist/main.js")],
    ROOT,
    "electron",
    35
  );

  // Kill everything when the Electron window closes
  electron.on("exit", () => {
    console.log("\n[launcher] Electron closed — shutting down all processes");
    backend.kill("SIGTERM");
    renderer.kill("SIGTERM");
    process.exit(0);
  });

  // Pass CTRL+C through to children
  process.on("SIGINT", () => {
    console.log("\n[launcher] SIGINT — shutting down");
    electron.kill("SIGTERM");
    backend.kill("SIGTERM");
    renderer.kill("SIGTERM");
    process.exit(0);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
