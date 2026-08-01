// ─── REST API payload types ───────────────────────────────────────────────────
import type {
  Server,
  ServerSoftware,
  ServerFramework,
  Backup,
  JavaVersion,
  JavaRuntime,
  JavaInstallJob,
  JavaRuntimeProviderId,
  JavaPackageType,
  JavaOverrideMode,
  Template,
  SoftwareArtifact,
  SoftwareDownload,
} from "./models.js";

// Servers
export interface CreateServerDto {
  name: string;
  path: string;
  version: string;
  software: ServerSoftware;
  javaPath: string;
  javaRuntimeId?: string | null;
  javaOverrideMode?: JavaOverrideMode;
  allowUnsupportedJava?: boolean;
  ramMinMb?: number;
  ramMaxMb?: number;
  port?: number;
  startupArgs?: string;
  autoStart?: boolean;
  /** if provided, install from this template id instead of blank */
  templateId?: string;
  /** if provided, install a cached/downloaded server jar during creation */
  softwareSource?: SoftwareSourceDto;
  /** required when softwareSource is provided */
  eulaAccepted?: boolean;
}

export interface UpdateServerDto {
  name?: string;
  path?: string;
  version?: string;
  software?: ServerSoftware;
  javaPath?: string;
  javaRuntimeId?: string | null;
  javaOverrideMode?: JavaOverrideMode;
  allowUnsupportedJava?: boolean;
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

// Server software manager
export interface SoftwareProviderInfo {
  id: ServerFramework;
  label: string;
  homepage: string;
  enabled: boolean;
  supportsBuildSelection: boolean;
  reasonUnavailable?: string;
}

export interface SoftwareProviderListResponse {
  providers: SoftwareProviderInfo[];
}

export interface SoftwareVersionListResponse {
  versions: string[];
  offline: boolean;
}

export interface SoftwareBuild {
  id: string;
  label: string;
  recommended?: boolean;
  cached?: boolean;
  artifactId?: string;
}

export interface SoftwareBuildListResponse {
  builds: SoftwareBuild[];
  offline: boolean;
}

export interface SoftwareArtifactListResponse {
  artifacts: SoftwareArtifact[];
}

export interface SoftwareCacheStatusResponse {
  cached: boolean;
  artifact: SoftwareArtifact | null;
}

export interface SoftwareSourceDto {
  provider: ServerFramework;
  minecraftVersion: string;
  buildId: string;
  artifactId?: string;
  requestId?: string;
}

export interface CreateSoftwareDownloadDto {
  provider: ServerFramework;
  minecraftVersion: string;
  buildId: string;
  requestId?: string;
}

export interface SoftwareDownloadResponse {
  download: SoftwareDownload;
  artifact: SoftwareArtifact | null;
  cached: boolean;
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
  provider?: JavaRuntimeProviderId;
  packageType?: JavaPackageType;
  requestId?: string;
}

export interface JavaListResponse {
  versions: JavaVersion[];
}

export interface JavaRuntimeProviderInfo {
  id: JavaRuntimeProviderId;
  label: string;
  homepage: string;
  supportedMajors: number[];
  enabled: boolean;
}

export interface JavaRuntimeProviderListResponse {
  providers: JavaRuntimeProviderInfo[];
}

export interface JavaRuntimeListResponse {
  runtimes: JavaRuntime[];
}

export interface JavaInstallResponse {
  install: JavaInstallJob;
  runtime: JavaRuntime | null;
}

export interface JavaRecommendationResponse {
  minecraftVersion: string;
  software: ServerSoftware;
  requiredMajor: number;
  recommendedMajor: number;
  confidence: "metadata" | "rules" | "unknown";
  compatibleRuntime: JavaRuntime | null;
  installedRuntimes: JavaRuntime[];
  missing: boolean;
  warnings: string[];
}

export interface AssignServerJavaRuntimeDto {
  javaRuntimeId?: string | null;
  javaPath?: string;
  javaOverrideMode?: JavaOverrideMode;
  allowUnsupportedJava?: boolean;
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
