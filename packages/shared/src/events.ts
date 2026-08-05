import type {
  ServerFramework,
  ServerStatus,
  JavaInstallStatus,
  JavaInstallStage,
  JavaRuntimeProviderId,
  SoftwareDownloadStatus,
  SoftwareInstallStage,
  PluginInstallStatus,
  PluginInstallStage,
} from "./models.js";

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

export interface ServerDeleteProgressPayload {
  serverId: string;
  status: "running" | "completed" | "failed";
  stage:
    | "stopping-server"
    | "creating-backup"
    | "removing-metadata"
    | "deleting-files"
    | "done"
    | "failed";
  message: string;
  percent: number;
  error?: string;
}

export interface SoftwareDownloadProgressPayload {
  downloadId: string;
  provider: ServerFramework;
  minecraftVersion: string;
  buildId: string;
  status: SoftwareDownloadStatus;
  stage: SoftwareInstallStage;
  bytesReceived: number;
  totalBytes: number | null;
  percent: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  error?: string;
}

export interface JavaInstallProgressPayload {
  installId: string;
  provider: JavaRuntimeProviderId;
  major: number;
  version: string | null;
  status: JavaInstallStatus;
  stage: JavaInstallStage;
  bytesReceived: number;
  totalBytes: number | null;
  percent: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  error?: string;
}

export interface PluginInstallProgressPayload {
  jobId: string;
  serverId: string;
  pluginId: string | null;
  projectId: string | null;
  versionId: string | null;
  action: "install" | "update" | "disable" | "enable" | "remove" | "restore";
  status: PluginInstallStatus;
  stage: PluginInstallStage;
  bytesReceived: number;
  totalBytes: number | null;
  percent: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  error?: string;
}

export interface ConsoleCommandPayload {
  serverId: string;
  command: string;
}

export interface ServerToClientEvents {
  "console:output": (payload: ConsoleOutputPayload) => void;
  "server:status": (payload: ServerStatusPayload) => void;
  "server:stats": (payload: ServerStatsPayload) => void;
  "server:delete-progress": (payload: ServerDeleteProgressPayload) => void;
  "backup:progress": (payload: BackupProgressPayload) => void;
  "software:download-progress": (payload: SoftwareDownloadProgressPayload) => void;
  "java:install-progress": (payload: JavaInstallProgressPayload) => void;
  "plugin:install-progress": (payload: PluginInstallProgressPayload) => void;
}

export interface ClientToServerEvents {
  "console:command": (
    payload: ConsoleCommandPayload,
    ack?: (result: { ok: boolean; error?: string }) => void
  ) => void;
}
