export type ServerStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "crashed";

export type ServerFramework = "paper" | "purpur" | "spigot" | "fabric";

export type ServerSoftware = ServerFramework;

export type SoftwareArtifactStatus =
  | "cached"
  | "downloading"
  | "failed"
  | "corrupted";

export type SoftwareDownloadStatus =
  | "queued"
  | "running"
  | "cached"
  | "completed"
  | "failed"
  | "cancelled";

export type SoftwareInstallStage =
  | "resolving-provider"
  | "checking-cache"
  | "downloading"
  | "verifying"
  | "installing-server-files"
  | "writing-eula"
  | "done"
  | "failed"
  | "cancelled";

export type JavaRuntimeProviderId = "adoptium" | "microsoft";

export type JavaRuntimeSource = "managed" | "system" | "manual";

export type JavaRuntimeStatus =
  | "valid"
  | "missing"
  | "corrupted"
  | "unsupported"
  | "installing";

export type JavaOverrideMode = "automatic" | "manual";

export type JavaPackageType = "jre" | "jdk";

export type JavaInstallStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type JavaInstallStage =
  | "resolving-provider"
  | "downloading"
  | "verifying"
  | "extracting"
  | "validating"
  | "registering"
  | "done"
  | "failed"
  | "cancelled";

export type BackupType = "manual" | "scheduled";

export interface Server {
  id: string;
  name: string;
  path: string;
  version: string;
  software: ServerSoftware;
  javaPath: string;
  javaRuntimeId: string | null;
  javaOverrideMode: JavaOverrideMode;
  allowUnsupportedJava: boolean;
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

export interface JavaRuntime {
  id: string;
  provider: JavaRuntimeProviderId | null;
  distribution: string;
  major: number;
  version: string;
  os: string;
  arch: string;
  source: JavaRuntimeSource;
  path: string;
  executablePath: string;
  status: JavaRuntimeStatus;
  checksum: string | null;
  detectedAt: Date | null;
  installedAt: Date | null;
  lastValidatedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JavaInstallJob {
  id: string;
  provider: JavaRuntimeProviderId;
  major: number;
  version: string | null;
  status: JavaInstallStatus;
  stage: JavaInstallStage;
  bytesReceived: number;
  totalBytes: number | null;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftwareArtifact {
  id: string;
  provider: ServerFramework;
  minecraftVersion: string;
  buildId: string;
  filename: string;
  sizeBytes: number;
  sha256: string | null;
  cachedPath: string;
  status: SoftwareArtifactStatus;
  downloadedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftwareDownload {
  id: string;
  provider: ServerFramework;
  minecraftVersion: string;
  buildId: string;
  status: SoftwareDownloadStatus;
  bytesReceived: number;
  totalBytes: number | null;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  stage: SoftwareInstallStage;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}
