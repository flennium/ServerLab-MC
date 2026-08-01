import { spawn, ChildProcess } from "child_process";
import treeKill from "tree-kill";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { io } from "../index.js";
import {
  trackPid,
  untrackPid,
  updateTps,
  updatePlayers,
} from "./MonitorService.js";
import { parseStartupArgs } from "./ProcessArgs.js";
import { javaRuntimeRegistry } from "./java/JavaRuntimeRegistry.js";
import { javaRuntimeValidator } from "./java/JavaRuntimeValidator.js";
import { javaRecommendationService } from "./java/JavaRecommendationService.js";
import type { ServerStatus } from "@serverlab/shared";

interface RunningServer {
  process: ChildProcess;
  serverId: string;
}

// Regexes for parsing Paper/Spigot/Purpur stdout
const TPS_REGEX = /TPS from last 1m, 5m, 15m: ([\d.]+)/;
const PLAYERS_REGEX = /There are (\d+) of a max/;
const DONE_REGEX = /Done \([\d.]+s\)!/;

class ServerManager {
  private running = new Map<string, RunningServer>();

  private buildCommand(server: {
    javaPath: string;
    ramMinMb: number;
    ramMaxMb: number;
    startupArgs: string | null;
  }): { cmd: string; args: string[] } {
    const args: string[] = [
      `-Xms${server.ramMinMb}m`,
      `-Xmx${server.ramMaxMb}m`,
    ];

    if (server.startupArgs) {
      args.push(...parseStartupArgs(server.startupArgs));
    }

    args.push("-jar", "server.jar", "nogui");
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
  }): Promise<string> {
    if (server.javaOverrideMode === "manual" || !server.javaRuntimeId) {
      await javaRuntimeValidator.validateExecutable(server.javaPath);
      return server.javaPath;
    }

    const runtime = await javaRuntimeRegistry.getRuntime(server.javaRuntimeId);
    if (!runtime) throw new Error("Selected Java runtime is missing. Choose or install a runtime.");
    const validated = await javaRuntimeValidator.validateRuntime(runtime);
    if (validated.status !== "valid") {
      throw new Error("Selected Java runtime is missing or corrupted. Validate, repair, or choose another runtime.");
    }

    const recommendation = await javaRecommendationService.recommend({
      minecraftVersion: server.version,
      software: server.software,
    });
    if (
      !javaRecommendationService.isCompatible(
        validated.major,
        recommendation.requiredMajor,
        server.allowUnsupportedJava
      )
    ) {
      throw new Error(
        `This server needs Java ${recommendation.requiredMajor}. Selected runtime is Java ${validated.major}.`
      );
    }

    await javaRuntimeRegistry.touchUsed(validated.id);
    return validated.executablePath;
  }

  private async setStatus(serverId: string, status: ServerStatus) {
    await prisma.server.update({ where: { id: serverId }, data: { status } });
    io.emit("server:status", { serverId, status });
    logger.info({ serverId, status }, "Server status changed");
  }

  private handleLine(serverId: string, line: string) {
    // Emit raw console output
    io.emit("console:output", {
      serverId,
      line,
      timestamp: new Date().toISOString(),
    });

    if (DONE_REGEX.test(line)) {
      this.setStatus(serverId, "running").catch(logger.error);
    }

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

    for (const [id] of this.running) {
      const s = await prisma.server.findUnique({ where: { id } });
      if (s && s.port === server.port && id !== serverId) {
        throw new Error(
          `Port ${server.port} is already in use by server "${s.name}"`
        );
      }
    }

    const { args } = this.buildCommand(server);
    const cmd = await this.resolveJavaCommand(server);

    await this.setStatus(serverId, "starting");

    const proc = spawn(cmd, args, {
      cwd: server.path,
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
    });

    this.running.set(serverId, { process: proc, serverId });

    if (proc.pid) {
      trackPid(serverId, proc.pid);
    }

    proc.stdout?.on("data", (chunk: Buffer) => {
      chunk
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach((line) => this.handleLine(serverId, line));
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      chunk
        .toString()
        .split("\n")
        .filter(Boolean)
        .forEach((line) =>
          io.emit("console:output", {
            serverId,
            line,
            timestamp: new Date().toISOString(),
          })
        );
    });

    proc.on("exit", async (code) => {
      if (proc.pid) untrackPid(proc.pid);
      this.running.delete(serverId);
      const status: ServerStatus = code === 0 ? "stopped" : "crashed";
      await this.setStatus(serverId, status);
    });

    proc.on("error", async (err) => {
      logger.error({ err, serverId }, "Process error");
      if (proc.pid) untrackPid(proc.pid);
      this.running.delete(serverId);
      await this.setStatus(serverId, "crashed");
    });
  }

  async stop(serverId: string): Promise<void> {
    const entry = this.running.get(serverId);
    if (!entry) throw new Error(`Server ${serverId} is not running`);

    await this.setStatus(serverId, "stopping");
    entry.process.stdin?.write("stop\n");

    const forceKillTimeout = setTimeout(() => {
      if (entry.process.pid) treeKill(entry.process.pid, "SIGKILL");
    }, 15_000);

    entry.process.once("exit", () => clearTimeout(forceKillTimeout));
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

  isRunning(serverId: string): boolean {
    return this.running.has(serverId);
  }

  async stopAll(): Promise<void> {
    const ids = [...this.running.keys()];
    await Promise.allSettled(ids.map((id) => this.stop(id)));
  }
}

export const serverManager = new ServerManager();
