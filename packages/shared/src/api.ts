import type {
  Server,
  ServerSoftware,
  ServerFramework,
  ServerKind,
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
  InstalledPlugin,
  PluginDependency,
  PluginInstallJob,
  SoftwareAcquisition,
  SoftwareBuildJob,
  JavaRequirementDetection,
} from "./models.js";
import type { AppError } from "./errors.js";

// Servers
export interface CreateServerDto {
  name: string;
  path: string;
  version: string;
  software: ServerSoftware;
  kind?: ServerKind;
  targetMinecraftVersion?: string | null;
  bindAddress?: string;
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
  targetMinecraftVersion?: string | null;
  bindAddress?: string;
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

export interface DeleteServerResponse {
  message: string;
  serverId: string;
  deletedPath: string;
  backupCreated: boolean;
}

// Port management
export type PortReservationOwnerType = "server" | "backend" | "dev-service";
export type PortStatusSource =
  | "available"
  | "serverlab-running"
  | "serverlab-saved"
  | "external"
  | "unknown";

export interface PortReservationOwner {
  ownerType: PortReservationOwnerType;
  ownerId: string;
  ownerName?: string | null;
}

export interface PortStatus {
  port: number;
  host: string;
  available: boolean;
  ownerType: PortReservationOwnerType | null;
  ownerId: string | null;
  ownerName: string | null;
  source: PortStatusSource;
  processId: number | null;
  processName: string | null;
  commandLine: string | null;
  suggestedPort: number | null;
  message: string;
}

export interface PortCheckResponse {
  status: PortStatus;
}

export interface PortSuggestionResponse {
  port: number;
}

export interface PortStatusListResponse {
  ports: PortStatus[];
}

export interface PortConflictResponse {
  status: PortStatus;
}

// Server software manager
export interface SoftwareProviderInfo {
  id: ServerFramework;
  label: string;
  homepage: string;
  enabled: boolean;
  supportsBuildSelection: boolean;
  acquisition: SoftwareAcquisition;
  supportedRevisionSource?: "provider" | "minecraft-release-metadata";
  requiresJdk?: boolean;
  buildTool?: string;
  reasonUnavailable?: string;
  kind: ServerKind;
  releaseSource: "provider" | "minecraft-release-metadata" | "jenkins";
  requiresEula: boolean;
  recommendedJavaMajor?: number;
  minimumJavaMajor?: number;
  pluginLoaders: string[];
  configFormat: "properties" | "yaml" | "toml" | "none";
  deprecated?: boolean;
  warning?: string;
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
  sourceType?: SoftwareAcquisition;
  buildJobId?: string;
  targetMinecraftVersion?: string | null;
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

export interface SoftwareDownloadJobResponse {
  download: SoftwareDownload;
}

export interface BuildToolsPreflightResult {
  ready: boolean;
  javaRuntimeId: string | null;
  javaMajor: number | null;
  javaExecutable: string | null;
  hasJdk: boolean;
  gitAvailable: boolean;
  gitPath: string | null;
  gitSource: "bundled" | "system" | null;
  diskSpaceBytes: number | null;
  requiredDiskSpaceBytes: number;
  offline: boolean;
  activeJobId: string | null;
  checks: Array<{
    id: "java" | "jdk" | "git" | "disk" | "network" | "cache" | "active-job";
    status: "passed" | "warning" | "failed";
    message: string;
  }>;
}

export interface SoftwareBuildJobResponse {
  job: SoftwareBuildJob;
  artifact: SoftwareArtifact | null;
  cached: boolean;
}

export interface SoftwareBuildToolsStatusResponse {
  cached: boolean;
  buildNumber: string | null;
  version: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  downloadedAt: string | null;
}

export interface CreateSoftwareBuildDto {
  provider: "spigot";
  minecraftVersion: string;
  javaRuntimeId?: string;
  requestId?: string;
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
  type: "directory" | "config" | "json" | "yaml" | "properties" | "log" | "text" | "archive" | "binary" | "other";
  extension: string | null;
  isEditable: boolean;
  isBinary: boolean;
  isLarge: boolean;
  readonly: boolean;
  sizeBytes: number | null;
  modifiedAt: string;
}

export interface FileListResponse {
  entries: FileEntry[];
}

export interface FileSearchResponse {
  entries: FileEntry[];
  total: number;
  truncated: boolean;
}

export interface FileContentResponse {
  path: string;
  content: string;
  encoding: "utf-8" | "binary";
  language: "yaml" | "json" | "properties" | "javascript" | "text" | "log" | "toml" | "unknown";
  sizeBytes: number;
  modifiedAt: string;
  etag: string;
  readonly: boolean;
  restartHint: string | null;
  validation: {
    status: "valid" | "warning" | "invalid" | "unknown";
    message: string | null;
    line?: number;
  };
  isTruncated: boolean;
  previewBytes: number | null;
}

export interface WriteFileDto {
  path: string;
  content: string;
  expectedEtag?: string;
  force?: boolean;
}

export interface CreateFileDto {
  path: string;
  content?: string;
}

export interface CreateFolderDto {
  path: string;
}

export interface DuplicateFileDto {
  path: string;
  targetPath?: string;
}

// Plugins / Modrinth
export type PluginCompatibilityStatus = "compatible" | "warning" | "incompatible";

export interface PluginCompatibility {
  status: PluginCompatibilityStatus;
  reason: string;
  matchedLoaders: string[];
  matchedVersions: string[];
}

export interface ModrinthSearchRequest {
  query?: string;
  serverId?: string;
  loader?: string;
  minecraftVersion?: string;
  category?: string;
  sort?: "relevance" | "downloads" | "follows" | "newest" | "updated";
  offset?: number;
  limit?: number;
}

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  author: string | null;
  description: string;
  body?: string | null;
  projectType: string;
  iconUrl: string | null;
  downloads: number;
  followers: number;
  categories: string[];
  loaders: string[];
  gameVersions: string[];
  license: string | null;
  updatedAt: string | null;
  sourceUrl: string | null;
  issuesUrl: string | null;
  wikiUrl: string | null;
}

export interface ModrinthProjectSearchHit extends ModrinthProject {
  compatibility: PluginCompatibility | null;
}

export interface ModrinthSearchResponse {
  hits: ModrinthProjectSearchHit[];
  totalHits: number;
  offset: number;
  limit: number;
  offline: boolean;
}

export interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  hashes: {
    sha1?: string;
    sha512?: string;
  };
}

export interface ModrinthVersionDependency {
  projectId: string | null;
  projectName?: string | null;
  versionId: string | null;
  fileName: string | null;
  dependencyType: "required" | "optional" | "incompatible" | "embedded";
}

export interface ModrinthVersion {
  id: string;
  projectId: string;
  name: string;
  versionNumber: string;
  versionType: "release" | "beta" | "alpha";
  loaders: string[];
  gameVersions: string[];
  datePublished: string;
  files: ModrinthVersionFile[];
  dependencies: ModrinthVersionDependency[];
  compatibility: PluginCompatibility | null;
}

export interface ModrinthProjectResponse {
  project: ModrinthProjectSearchHit;
}

export interface ModrinthVersionListResponse {
  versions: ModrinthVersion[];
  offline: boolean;
}

export interface InstalledPluginListResponse {
  plugins: InstalledPlugin[];
}

export interface PluginInstallRequest {
  projectId: string;
  versionId: string;
  allowWarning?: boolean;
  dependencyMode?: "none" | "required" | "all";
  requestId?: string;
}

export interface PluginInstallResponse {
  job: PluginInstallJob;
  plugin: InstalledPlugin | null;
  dependencies: PluginDependency[];
  installedDependencies?: InstalledPlugin[];
  restartRequired: boolean;
}

export interface PluginJobResponse {
  job: PluginInstallJob;
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

export interface JavaInstallJobResponse {
  install: JavaInstallJob;
}

export interface JavaRecommendationResponse {
  minecraftVersion: string;
  software: ServerSoftware;
  requiredMajor: number;
  recommendedMajor: number;
  confidence: "jar" | "metadata" | "rules" | "fallback" | "unknown";
  detection: JavaRequirementDetection | null;
  source: "jar-class-files" | "jar-metadata" | "online-provider-metadata" | "official-guidance" | "fallback-rules";
  sourceUrl: string | null;
  checkedAt: string;
  compatibleRuntime: JavaRuntime | null;
  installedRuntimes: JavaRuntime[];
  missing: boolean;
  warnings: string[];
}

export interface JavaGuidanceEntry {
  serverId: string;
  serverName: string;
  software: ServerSoftware;
  version: string;
  requiredMajor: number;
  recommendedMajor: number;
  selectedRuntimeMajor: number | null;
  selectedRuntimeVersion: string | null;
  selectedRuntimeSource: string | null;
  confidence: JavaRecommendationResponse["confidence"];
  source: JavaRecommendationResponse["source"];
  sourceUrl: string | null;
  detectionMethod: string | null;
  detectionConfidence: "high" | "medium" | "low" | "unknown" | null;
  warnings: string[];
  checkedAt: string;
}

export interface JavaGuidanceResponse {
  entries: JavaGuidanceEntry[];
  checkedAt: string;
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

export interface TemplateCapability {
  id:
    | "import-export"
    | "one-click-create"
    | "modrinth-integration"
    | "backup-restore-rewrite";
  label: string;
  status: "planned" | "foundation" | "in-progress" | "available";
  description: string;
  details?: string[];
}

export interface TemplateCapabilityResponse {
  capabilities: TemplateCapability[];
  importFormats: string[];
  exportFormats: string[];
}

// Generic error/success
export interface ApiError {
  error: string | AppError;
  details?: string;
}

export interface ApiSuccess {
  message: string;
}
