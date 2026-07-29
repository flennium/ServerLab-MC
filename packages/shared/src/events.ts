// ─── Socket.IO event payload types ───────────────────────────────────────────
import type { ServerStatus } from "./models.js";

// server → client events
export interface ConsoleOutputPayload {
  serverId: string;
  line: string;
  timestamp: string;
}

export interface ServerStatusPayload {
  serverId: string;
  status: ServerStatus;
}

export interface ServerStatsPayload {
  serverId: string;
  cpu: number;
  ramMb: number;
  tps: number;
  players: number;
}

export interface BackupProgressPayload {
  backupId: string;
  percent: number;
}

export interface TemplateProgressPayload {
  templateId: string;
  stage: string;
  percent: number;
}

// client → server events
export interface ConsoleCommandPayload {
  serverId: string;
  command: string;
}

// Typed map consumed by socket.io typed emitters on both sides
export interface ServerToClientEvents {
  "console:output": (payload: ConsoleOutputPayload) => void;
  "server:status": (payload: ServerStatusPayload) => void;
  "server:stats": (payload: ServerStatsPayload) => void;
  "backup:progress": (payload: BackupProgressPayload) => void;
  "template:progress": (payload: TemplateProgressPayload) => void;
}

export interface ClientToServerEvents {
  "console:command": (payload: ConsoleCommandPayload) => void;
}
