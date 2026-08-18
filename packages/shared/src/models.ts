export type ServerStatus = "stopped" | "starting" | "running" | "stopping" | "crashed";

export type ServerFramework = "paper" | "purpur" | "folia" | "spigot" | "fabric" | "vanilla" | "velocity" | "waterfall" | "bungeecord";

export type ServerKind = "server" | "proxy";

export type ServerConfigurationState = "ready" | "needs-setup" | "invalid";

export type ServerSoftware = ServerFramework;

export type SoftwareArtifactStatus = "cached" | "downloading" | "failed" | "corrupted";

export type SoftwareAcquisition = "download" | "build";

export type SoftwareDownloadStatus =
  "queued" | "running" | "cached" | "completed" | "failed" | "cancelled";

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

export type SoftwareBuildJobStatus =
  | "queued"
  | "preflight"
  | "downloading-tool"
  | "preparing-workspace"
  | "building"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled";

export type SoftwareBuildStage =
  | "checking-prerequisites"
  | "resolving-buildtools"
  | "downloading-buildtools"
  | "preparing-workspace"
  | "running-buildtools"
  | "locating-artifact"
  | "verifying-artifact"
  | "caching-artifact"
  | "done"
  | "failed"
  | "cancelled";

export type JavaRuntimeProviderId = "adoptium" | "microsoft";

export type JavaRuntimeSource = "managed" | "system" | "manual";

export type JavaRuntimeStatus =
  "valid" | "missing" | "corrupted" | "unsupported" | "installing";

export type JavaOverrideMode = "automatic" | "manual";

export type JavaRequirementConfidence = "high" | "medium" | "low" | "unknown";
export type JavaRequirementMethod =
  | "class-file"
  | "bootstrap-metadata"
  | "manifest"
  | "fallback"
  | "ambiguous"
  | "unknown";

export type JavaPackageType = "jre" | "jdk";

export type JavaInstallStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";

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

export type PluginSource = "modrinth" | "manual";

export type PluginContentType =
  | "plugin"
  | "mod"
  | "datapack"
  | "modpack"
  | "resourcepack";

export type PluginStatus = "installed" | "disabled" | "missing" | "trashed" | "manual";

export type PluginInstallStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";

export type PluginInstallAction =
  | "install"
  | "update"
  | "disable"
  | "enable"
  | "remove";

export type PluginInstallStage =
  | "resolving-project"
  | "checking-compatibility"
  | "resolving-dependencies"
  | "downloading"
  | "verifying"
  | "installing"
  | "updating-records"
  | "done"
  | "failed"
  | "cancelled";

export interface Server {
  id: string;
  name: string;
  path: string;
  version: string;
  software: ServerSoftware;
  kind: ServerKind;
  softwareBuildId: string | null;
  targetMinecraftVersion: string | null;
  bindAddress: string;
  configurationState: ServerConfigurationState;
  javaRequirementMajor: number | null;
  javaRequirementConfidence: JavaRequirementConfidence | null;
  javaRequirementMethod: JavaRequirementMethod | null;
  javaRequirementDetails: string | null;
  javaRequirementDetectedAt: Date | null;
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
  sizeBytes: number | null;
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
  acquisition: SoftwareAcquisition;
  buildTool: string | null;
  buildToolVersion: string | null;
  sourceMetadataJson: string | null;
  buildLogPath: string | null;
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

export interface JavaRequirementDetection {
  requiredMajor: number | null;
  confidence: JavaRequirementConfidence;
  method: JavaRequirementMethod;
  jarPath: string;
  classFileMajor: number | null;
  metadataMajor: number | null;
  indicators: string[];
  warnings: string[];
}

export interface SoftwareBuildJob {
  id: string;
  provider: ServerFramework;
  minecraftVersion: string;
  buildId: string;
  toolVersion: string | null;
  status: SoftwareBuildJobStatus;
  stage: SoftwareBuildStage;
  bytesReceived: number;
  totalBytes: number | null;
  percent: number | null;
  pid: number | null;
  workspacePath: string | null;
  logPath: string | null;
  artifactPath: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface InstalledPlugin {
  id: string;
  serverId: string;
  source: PluginSource;
  contentType: PluginContentType;
  sourceProjectId: string | null;
  sourceVersionId: string | null;
  slug: string | null;
  name: string;
  installedVersion: string;
  fileName: string;
  filePath: string;
  fileHashSha1: string | null;
  fileHashSha512: string | null;
  fileSizeBytes: number | null;
  enabled: boolean;
  status: PluginStatus;
  updateAvailable: boolean;
  installedAt: Date | null;
  updatedAt: Date;
  lastCheckedAt: Date | null;
}

export interface PluginDependency {
  id: string;
  pluginId: string;
  dependsOnProjectId: string;
  dependsOnVersionId: string | null;
  dependsOnName: string | null;
  dependencyType: "required" | "optional" | "incompatible" | "embedded";
  resolvedPluginId: string | null;
}

export interface PluginInstallJob {
  id: string;
  serverId: string;
  pluginId: string | null;
  projectId: string | null;
  versionId: string | null;
  action: PluginInstallAction;
  status: PluginInstallStatus;
  stage: PluginInstallStage;
  bytesReceived: number;
  totalBytes: number | null;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}
