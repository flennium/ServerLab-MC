import si from "systeminformation";
import { io } from "../index.js";
import { logger } from "../lib/logger.js";
import type { ServerStatsPayload } from "@serverlab/shared";

const POLL_INTERVAL_MS = 2000;

// Per-server TPS tracker (updated by ServerManager when it parses stdout)
const tpsMap = new Map<string, number>();
const playerMap = new Map<string, number>();

export function updateTps(serverId: string, tps: number) {
  tpsMap.set(serverId, tps);
}

export function updatePlayers(serverId: string, count: number) {
  playerMap.set(serverId, count);
}

// PID → serverId mapping so we can attribute CPU/RAM to the right server
const pidMap = new Map<number, string>();

export function trackPid(serverId: string, pid: number) {
  pidMap.set(pid, serverId);
}

export function untrackPid(pid: number) {
  pidMap.delete(pid);
}

let pollTimer: NodeJS.Timeout | null = null;

export function startMonitor() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (pidMap.size === 0) return;

    try {
      // Get per-process CPU + memory stats
      const processList = await si.processes();

      for (const [pid, serverId] of pidMap.entries()) {
        const proc = processList.list.find((p) => p.pid === pid);
        if (!proc) continue;

        const payload: ServerStatsPayload = {
          serverId,
          cpu: parseFloat(proc.cpu.toFixed(1)),
          ramMb: Math.round(proc.memRss / 1024),
          tps: tpsMap.get(serverId) ?? 20.0,
          players: playerMap.get(serverId) ?? 0,
        };

        io.emit("server:stats", payload);
      }
    } catch (err) {
      logger.warn({ err }, "MonitorService poll error");
    }
  }, POLL_INTERVAL_MS);

  logger.info("MonitorService started");
}

export function stopMonitor() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
