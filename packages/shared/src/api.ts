// ─── REST API payload types ───────────────────────────────────────────────────
import type { Server, ServerSoftware, Backup, JavaVersion, Template } from "./models.js";

// Servers
export interface CreateServerDto {
  name: string;
  path: string;
  version: string;
  software: ServerSoftware;
  javaPath: string;
  ramMinMb?: number;
  ramMaxMb?: number;
  port?: number;
  startupArgs?: string;
  autoStart?: boolean;
  /** if provided, install from this template id instead of blank */
  templateId?: string;
}

export interface UpdateServerDto {
  name?: string;
  path?: string;
  version?: string;
  software?: ServerSoftware;
  javaPath?: string;
  ramMinMb?: number;
  ramMaxMb?: number;
  port?: number;
  startupArgs?: string;
  autoStart?: boolean;
}

export interface ServerListResponse {
  servers: Server[];
}

export interface ServerResponse {
  server: Server;
}

// Console
export interface SendCommandDto {
  command: string;
}

// File manager
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number | null;
  modifiedAt: string;
}

export interface FileListResponse {
  entries: FileEntry[];
}

export interface FileContentResponse {
  path: string;
  content: string;
}

export interface WriteFileDto {
  path: string;
  content: string;
}

// Backups
export interface CreateBackupDto {
  type?: "manual" | "scheduled";
}

export interface BackupListResponse {
  backups: Backup[];
}

// Java
export interface InstallJdkDto {
  major: number;
}

export interface JavaListResponse {
  versions: JavaVersion[];
}

// Templates
export interface TemplateListResponse {
  templates: Template[];
}

// Generic error/success
export interface ApiError {
  error: string;
  details?: string;
}

export interface ApiSuccess {
  message: string;
}
