import { spawn, ChildProcess } from "child_process";
import fs from "fs/promises";
import path from "path";
import treeKill from "tree-kill";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { io } from "../index.js";
import { trackPid, untrackPid, updateTps, updatePlayers } from "./MonitorService.js";
import { parseStartupArgs } from "./ProcessArgs.js";
import {
  portManagerService,
} from "./PortManagerService.js";
import { javaRuntimeRegistry } from "./java/JavaRuntimeRegistry.js";
import { javaRuntimeValidator } from "./java/JavaRuntimeValidator.js";
import { javaRecommendationService } from "./java/JavaRecommendationService.js";
import { HttpError } from "../middleware/error.js";
import { errorService } from "./ErrorService.js";
import type { ServerDeleteProgressPayload, ServerStatus } from "@serverlab/shared";

interface RunningServer {
  process: ChildProcess;
  serverId: string;
  port: number;
  cwd: string;
  startedAt: string;
  stopRequested: boolean;
  stopCommand: string;
  generation: number;
  finalized: boolean;
}

interface TrackedProcessRecord {
  serverId: string;
  pid: number;
  port: number;
  command: string;
  cwd: string;
  startedAt: string;
}

// Regexes for parsing Paper/Spigot/Purpur stdout
const TPS_REGEX = /TPS from last 1m, 5m, 15m: ([\d.]+)/;
const PLAYERS_REGEX = /There are (\d+) of a max/;
const DONE_REGEX = /Done \([\d.]+s\)!/;
const PORT_BIND_ERROR_REGEX = /(address already in use|bindexception|failed to bind|perhaps a server is already running)/i;

function isProxy(server: { kind?: string; software: string }): boolean {
  return server.kind === "proxy" || ["velocity", "waterfall", "bungeecord"].includes(server.software);
}

function lifecycleFor(server: { kind?: string; software: string }): {
  stopCommand: string;
  readyPattern: RegExp;
  configFile: string | null;
} {
  if (server.software === "velocity") {
    return { stopCommand: "shutdown", readyPattern: /Listening on|Done|Started/i, configFile: "velocity.toml" };
  }
  if (server.software === "waterfall" || server.software === "bungeecord") {
    return { stopCommand: "end", readyPattern: /Listening on|Enabled BungeeCord|Started/i, configFile: "config.yml" };
  }
  return { stopCommand: "stop", readyPattern: DONE_REGEX, configFile: "server.properties" };
}

class ServerManager {
  private running = new Map<string, RunningServer>();
  private staleProcesses: TrackedProcessRecord[] = [];
  private statusQueues = new Map<string, Promise<void>>();
  private lifecycleGenerations = new Map<string, number>();

  private processRegistryPath(): string {
    const dataDir = process.env.DATA_DIR ?? process.cwd();
    return path.join(dataDir, "processes", "servers.json");
  }

  private async writeProcessRegistry(): Promise<void> {
    const filePath = this.processRegistryPath();
    const records: TrackedProcessRecord[] = [...this.running.values()]
      .filter((entry) => entry.process.pid)
      .map((entry) => ({
        serverId: entry.serverId,
        pid: entry.process.pid!,
        port: entry.port,
        command: entry.process.spawnfile,
        cwd: entry.cwd,
        startedAt: entry.startedAt,
      }));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(records, null, 2), "utf-8");
  }

  private async clearProcessRegistry(): Promise<void> {
    await this.writeProcessRegistry().catch((error) => {
      logger.warn({ error }, "Failed to update process registry");
    });
  }

  async restoreTrackedProcesses(): Promise<void> {
    const filePath = this.processRegistryPath();
    const raw = await fs.readFile(filePath, "utf-8").catch(() => null);
    if (!raw) return;

    const records = JSON.parse(raw) as TrackedProcessRecord[];
    this.staleProcesses = records.filter((record) => {
      try {
        process.kill(record.pid, 0);
        return true;
      } catch {
        return false;
      }
    });

    if (this.staleProcesses.length > 0) {
      logger.warn({ staleProcesses: this.staleProcesses }, "Found stale ServerLab-owned server processes");
    }

    await fs.writeFile(filePath, JSON.stringify(this.staleProcesses, null, 2), "utf-8").catch(() => {});
  }

  private buildCommand(server: {
    javaPath: string;
    ramMinMb: number;
    ramMaxMb: number;
    startupArgs: string | null;
    kind?: string;
    software: string;
  }): { cmd: string; args: string[] } {
    const args: string[] = [`-Xms${server.ramMinMb}m`, `-Xmx${server.ramMaxMb}m`];

    if (server.startupArgs) {
      args.push(...parseStartupArgs(server.startupArgs));
    }

    args.push("-jar", "server.jar");
    if (!isProxy(server)) args.push("nogui");
    return { cmd: server.javaPath, args };
  }

  private async resolveJavaCommand(server: {
    id: string;
    javaPath: string;
    javaRuntimeId: string | null;
    javaOverrideMode: string;
    allowUnsupportedJava: boolean;
    version: string;
    software: string;
    path: string;
  }): Promise<string> {
    if (server.javaOverrideMode === "manual" || !server.javaRuntimeId) {
      const validated = await javaRuntimeValidator.validateExecutable(server.javaPath);
      await this.assertJavaCompatible(server, validated.major);
      return server.javaPath;
    }

    const runtime = await javaRuntimeRegistry.getRuntime(server.javaRuntimeId);
    if (!runtime)
      throw new Error("Selected Java runtime is missing. Choose or install a runtime.");
    const validated = await javaRuntimeValidator.validateRuntime(runtime);
    if (validated.status !== "valid") {
      throw new Error(
        "Selected Java runtime is missing or corrupted. Validate, repair, or choose another runtime."
      );
    }

    await this.assertJavaCompatible(server, validated.major);

    await javaRuntimeRegistry.touchUsed(validated.id);
    return validated.executablePath;
  }

  private async assertJavaCompatible(
    server: { id: string; path: string; version: string; software: string; allowUnsupportedJava: boolean },
    major: number
  ): Promise<void> {
    const recommendation = await javaRecommendationService.recommend({
      minecraftVersion: server.version,
      software: server.software,
      artifactPath: path.join(server.path, "server.jar"),
      serverId: server.id,
    });
    if (javaRecommendationService.isCompatible(major, recommendation.requiredMajor, server.allowUnsupportedJava, server.software)) {
      return;
    }

    throw new HttpError(
      409,
      `Java ${recommendation.requiredMajor} is required for ${server.software} ${server.version}.`,
      "java",
      "warning",
      `Install or select Java ${recommendation.requiredMajor} in the Java Runtime Center, then start the server again.`,
      ["retry", "open-java-center", "copy-details", "dismiss"]
    );
  }

  private async setStatus(serverId: string, status: ServerStatus) {
    await prisma.server.update({ where: { id: serverId }, data: { status } });
    io.emit("server:status", { serverId, status });
    logger.info({ serverId, status }, "Server status changed");
  }

  // Process output and exit events arrive independently. Serialize status writes
  // and ignore events from an older process generation after a restart.
  private queueStatus(
    serverId: string,
    status: ServerStatus,
    options: {
      generation?: number;
      process?: ChildProcess;
      requireActiveProcess?: boolean;
      allowStopRequested?: boolean;
    } = {}
  ): Promise<void> {
    const previous = this.statusQueues.get(serverId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if (
          options.generation !== undefined &&
          this.lifecycleGenerations.get(serverId) !== options.generation
        ) {
          return;
        }

        if (options.process && options.requireActiveProcess) {
          const entry = this.running.get(serverId);
          if (
            !entry ||
            entry.process !== options.process ||
            (entry.stopRequested && !options.allowStopRequested)
          ) {
            return;
          }
        }

        await this.setStatus(serverId, status);
      })
      .finally(() => {
        if (this.statusQueues.get(serverId) === next) {
          this.statusQueues.delete(serverId);
        }
      });

    this.statusQueues.set(serverId, next);
    return next;
  }

  private nextLifecycleGeneration(serverId: string): number {
    const generation = (this.lifecycleGenerations.get(serverId) ?? 0) + 1;
    this.lifecycleGenerations.set(serverId, generation);
    return generation;
  }

  private async ensureServerPropertiesPort(serverPath: string, port: number): Promise<void> {
    const filePath = path.join(serverPath, "server.properties");
    const existing = await fs.readFile(filePath, "utf-8").catch(() => "");
    const lines = existing ? existing.split(/\r?\n/) : [];
    let found = false;
    const next = lines.map((line) => {
      if (/^\s*server-port\s*=/.test(line)) {
        found = true;
        return `server-port=${port}`;
      }
      return line;
    });
    if (!found) next.push(`server-port=${port}`);
    await fs.mkdir(serverPath, { recursive: true });
    await fs.writeFile(filePath, next.filter((line, index) => line || index < next.length - 1).join("\n"), "utf-8");
  }

  private async ensureProxyPort(server: {
    path: string;
    port: number;
    bindAddress: string;
    software: string;
  }): Promise<void> {
    const configFile = lifecycleFor(server).configFile;
    if (!configFile || configFile === "server.properties") return;
    const filePath = path.join(server.path, configFile);
    const existing = await fs.readFile(filePath, "utf-8").catch(() => null);
    if (existing === null) return;
    const endpoint = `${server.bindAddress}:${server.port}`;
    let updated = existing;
    if (server.software === "velocity") {
      if (!/^\s*bind\s*=/m.test(existing)) throw new Error("Velocity configuration is missing its bind setting");
      updated = existing.replace(/^\s*bind\s*=.*$/m, `bind = "${endpoint}"`);
    } else {
      if (!/^\s*-\s*host\s*:/m.test(existing)) throw new Error(`${server.software} configuration is missing its listener host setting`);
      updated = existing.replace(/^(\s*-\s*host\s*:)\s*.*$/m, `$1 ${endpoint}`);
    }
    if (updated !== existing) await fs.writeFile(filePath, updated, "utf-8");
  }

  private async refreshProxyConfigurationState(server: { id: string; path: string; software: string }): Promise<void> {
    if (!["velocity", "waterfall", "bungeecord"].includes(server.software)) return;
    const configFile = lifecycleFor(server).configFile;
    if (!configFile) return;
    const exists = await fs.stat(path.join(server.path, configFile)).then(() => true).catch(() => false);
    await prisma.server.update({
      where: { id: server.id },
      data: { configurationState: exists ? "ready" : "needs-setup" },
    });
  }

  private handleLine(
    serverId: string,
    line: string,
    software: string,
    process: ChildProcess,
    generation: number
  ) {
    // Emit raw console output
    io.emit("console:output", {
      serverId,
      line,
      timestamp: new Date().toISOString(),
    });

    if (lifecycleFor({ software }).readyPattern.test(line)) {
      void this.queueStatus(serverId, "running", {
        process,
        generation,
        requireActiveProcess: true,
      }).catch(logger.error);
    }

    if (["velocity", "waterfall", "bungeecord"].includes(software)) return;
    const tpsMatch = line.match(TPS_REGEX);
    if (tpsMatch) {
      updateTps(serverId, parseFloat(tpsMatch[1]));
    }

    const playersMatch = line.match(PLAYERS_REGEX);
    if (playersMatch) {
      updatePlayers(serverId, parseInt(playersMatch[1], 10));
    }
  }

  async start(serverId: string): Promise<void> {
    if (this.running.has(serverId)) {
      throw new Error(`Server ${serverId} is already running`);
    }

    const server = await prisma.server.findUniqueOrThrow({
      where: { id: serverId },
    });

    await portManagerService.assertAvailableForServer(server.port, serverId, server.bindAddress);

    const { args } = this.buildCommand(server);
    const cmd = await this.resolveJavaCommand(server);
    const lifecycle = lifecycleFor(server);

    const generation = this.nextLifecycleGeneration(serverId);
    await this.queueStatus(serverId, "starting", { generation });
    if (isProxy(server)) {
      await this.ensureProxyPort(server);
    } else {
      await this.ensureServerPropertiesPort(server.path, server.port);
    }
    portManagerService.reservePort({
      ownerType: "server",
      ownerId: serverId,
      ownerName: server.name,
      port: server.port,
      host: server.bindAddress,
    });

    const proc = spawn(cmd, args, {
      cwd: server.path,
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
    });

    const runningEntry: RunningServer = {
      process: proc,
      serverId,
      port: server.port,
      cwd: server.path,
      startedAt: new Date().toISOString(),
      stopRequested: false,
      stopCommand: lifecycle.stopCommand,
      generation,
      finalized: false,
    };
    this.running.set(serverId, runningEntry);
    await this.writeProcessRegistry();

    if (proc.pid) {
      trackPid(serverId, proc.pid);
    }

    proc.stdout?.on("data", (chunk: Buffer) => {
      chunk
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach((line) => this.handleLine(serverId, line, server.software, proc, generation));
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      chunk
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach((line) => {
          if (PORT_BIND_ERROR_REGEX.test(line)) {
            const appError = errorService.createFromUnknown(line, {
              category: "network",
              severity: "error",
              userMessage: `Port ${server.port} is already in use.`,
              possibleSolution: "Choose another server port or close the process using it.",
              source: "backend:server-process",
              action: "start-server",
              recoveries: ["retry", "open-settings", "copy-details", "dismiss"],
            });
            void errorService.record(appError);
            io.emit("console:output", {
              serverId,
              line: `ServerLab detected a port conflict on ${server.port}. Choose another port in Settings or close the process using it.`,
              timestamp: new Date().toISOString(),
            });
          }
          io.emit("console:output", {
            serverId,
            line,
            timestamp: new Date().toISOString(),
          });
        });
    });

    const finalizeProcess = async (code: number | null, error?: Error) => {
      if (runningEntry.finalized) return;
      runningEntry.finalized = true;

      if (error) {
        logger.error({ err: error, serverId }, "Process error");
      }
      if (proc.pid) untrackPid(proc.pid);
      if (this.running.get(serverId)?.process === proc) {
        this.running.delete(serverId);
      }
      portManagerService.releasePort({ ownerType: "server", ownerId: serverId });
      await this.clearProcessRegistry();
      const status: ServerStatus = runningEntry.stopRequested || code === 0 ? "stopped" : "crashed";
      await this.refreshProxyConfigurationState(server).catch((error) => logger.warn({ error, serverId }, "Failed to refresh proxy configuration state"));
      await this.queueStatus(serverId, status, { generation });
    };

    proc.on("exit", async (code) => {
      await finalizeProcess(code);
    });

    proc.on("error", async (err) => {
      const appError = errorService.createFromUnknown(err, {
        category: "server",
        severity: "error",
        userMessage: "The Minecraft server process failed.",
        possibleSolution: "Review the console output and verify Java, files, and the configured port.",
        source: "backend:server-process",
        action: "start-server",
        recoveries: ["retry", "open-logs", "copy-details", "dismiss"],
      });
      void errorService.record(appError);
      await finalizeProcess(null, err);
    });
  }

  async stop(serverId: string, options: { timeoutMs?: number } = {}): Promise<void> {
    const entry = this.running.get(serverId);
    if (!entry) {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { status: true },
      });
      if (server && server.status !== "stopped") {
        await this.setStatus(serverId, "stopped");
      }
      portManagerService.releasePort({ ownerType: "server", ownerId: serverId });
      await this.clearProcessRegistry();
      logger.info({ serverId }, "Stop requested for an already-exited server");
      return;
    }

    entry.stopRequested = true;
    await this.queueStatus(serverId, "stopping", {
      generation: entry.generation,
      process: entry.process,
      requireActiveProcess: true,
      allowStopRequested: true,
    });
    await new Promise<void>((resolve) => {
      let settled = false;
      const forceKillTimeout = setTimeout(() => {
        if (settled) return;
        if (entry.process.pid) treeKill(entry.process.pid, "SIGKILL");
        finish();
      }, options.timeoutMs ?? 15_000);
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceKillTimeout);
        entry.process.off("exit", finish);
        entry.process.off("error", finish);
        resolve();
      };
      entry.process.once("exit", finish);
      entry.process.once("error", finish);
      if (entry.process.exitCode !== null) {
        finish();
        return;
      }
      try {
        entry.process.stdin?.write(`${entry.stopCommand}\n`);
      } catch {
        finish();
      }
    });
  }

  async restart(serverId: string): Promise<void> {
    if (this.running.has(serverId)) {
      await this.stop(serverId);
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!this.running.has(serverId)) {
            clearInterval(check);
            resolve();
          }
        }, 500);
      });
    }
    await this.start(serverId);
  }

  sendCommand(serverId: string, command: string): void {
    const entry = this.running.get(serverId);
    if (!entry) throw new Error(`Server ${serverId} is not running`);
    entry.process.stdin?.write(`${command}\n`);
  }

  emitDeleteProgress(payload: ServerDeleteProgressPayload): void {
    io.emit("server:delete-progress", payload);
  }

  isRunning(serverId: string): boolean {
    return this.running.has(serverId);
  }

  async stopAll(options: { wait?: boolean; timeoutMs?: number } = {}): Promise<void> {
    const ids = [...this.running.keys()];
    if (options.wait === false) {
      ids.forEach((id) => {
        const entry = this.running.get(id);
        entry?.process.stdin?.write(`${entry.stopCommand}\n`);
      });
      return;
    }
    await Promise.allSettled(ids.map((id) => this.stop(id, { timeoutMs: options.timeoutMs })));
  }
}

export const serverManager = new ServerManager();
