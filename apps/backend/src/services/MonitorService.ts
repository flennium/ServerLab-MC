import si from "systeminformation";
import { io } from "../index.js";
import { logger } from "../lib/logger.js";
import { errorService } from "./ErrorService.js";
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

// Map OS process IDs to ServerLab servers for CPU/RAM attribution.
const pidMap = new Map<number, string>();
const monitorSubscriptions = new Map<string, number>();

export function trackPid(serverId: string, pid: number) {
  pidMap.set(pid, serverId);
}

export function untrackPid(pid: number) {
  pidMap.delete(pid);
}

export function subscribeMonitor(serverId: string): void {
  monitorSubscriptions.set(serverId, (monitorSubscriptions.get(serverId) ?? 0) + 1);
}

export function unsubscribeMonitor(serverId: string): void {
  const count = monitorSubscriptions.get(serverId) ?? 0;
  if (count <= 1) monitorSubscriptions.delete(serverId);
  else monitorSubscriptions.set(serverId, count - 1);
}

let pollTimer: NodeJS.Timeout | null = null;
let pollInFlight = false;

export function startMonitor() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (pollInFlight || pidMap.size === 0 || monitorSubscriptions.size === 0) return;
    pollInFlight = true;

    try {
      // Get per-process CPU + memory stats
      const processList = await si.processes();

      for (const [pid, serverId] of pidMap.entries()) {
        if (!monitorSubscriptions.has(serverId)) continue;
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
      const error = errorService.createFromUnknown(err, {
        category: "server",
        severity: "warning",
        userMessage: "Live server metrics are temporarily unavailable.",
        possibleSolution: "Refresh the Monitor tab or restart the server.",
        source: "backend:monitor",
        action: "poll-server-metrics",
      });
      void errorService.record(error);
    } finally {
      pollInFlight = false;
    }
  }, POLL_INTERVAL_MS);

  logger.info("MonitorService started");
}

export function stopMonitor() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollInFlight = false;
}
