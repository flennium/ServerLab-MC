// ─── Database model types (mirrors Prisma schema) ────────────────────────────

export type ServerStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "crashed";

export type ServerSoftware = "paper" | "purpur" | "spigot" | "fabric";

export type BackupType = "manual" | "scheduled";

export interface Server {
  id: string;
  name: string;
  path: string;
  version: string;
  software: ServerSoftware;
  javaPath: string;
  ramMinMb: number;
  ramMaxMb: number;
  port: number;
  startupArgs: string | null;
  autoStart: boolean;
  status: ServerStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Template {
  id: string;
  name: string;
  repositoryUrl: string;
  version: string | null;
  author: string | null;
  official: boolean;
  installedAt: Date | null;
}

export interface Backup {
  id: string;
  serverId: string;
  location: string;
  sizeBytes: number;
  type: BackupType;
  createdAt: Date;
}

export interface JavaVersion {
  id: string;
  major: number;
  path: string;
  vendor: string | null;
  detected: boolean;
}
