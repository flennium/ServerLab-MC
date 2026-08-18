import type {
  ServerFramework,
  ServerKind,
  SoftwareAcquisition,
  SoftwareBuild,
  SoftwareProviderInfo,
} from "@serverlab/shared";

export interface SoftwareArtifactMeta {
  provider: ServerFramework;
  acquisition: SoftwareAcquisition;
  minecraftVersion: string;
  buildId: string;
  filename: string;
  downloadUrl: string;
  expectedSizeBytes?: number;
  sha256?: string;
  sha1?: string;
  upstreamMetadataUrl?: string;
  licenseNotes?: string;
  buildTool?: string;
  buildToolVersion?: string;
}

export interface ResolveArtifactRequest {
  minecraftVersion: string;
  buildId: string;
}

export interface SoftwareProvider {
  id: ServerFramework;
  label: string;
  homepage: string;
  enabled: boolean;
  supportsBuildSelection: boolean;
  acquisition: SoftwareAcquisition;
  kind: ServerKind;
  releaseSource: "provider" | "minecraft-release-metadata" | "jenkins";
  requiresEula: boolean;
  recommendedJavaMajor?: number;
  minimumJavaMajor?: number;
  pluginLoaders: string[];
  configFormat: "properties" | "yaml" | "toml" | "none";
  deprecated?: boolean;
  warning?: string;
  supportedRevisionSource?: "provider" | "minecraft-release-metadata";
  requiresJdk?: boolean;
  buildTool?: string;
  allowedHosts: string[];
  reasonUnavailable?: string;
  listMinecraftVersions(): Promise<string[]>;
  listBuilds(minecraftVersion: string): Promise<SoftwareBuild[]>;
  resolveArtifact(request: ResolveArtifactRequest): Promise<SoftwareArtifactMeta>;
  validateArtifact(filePath: string, artifactMeta: SoftwareArtifactMeta): Promise<void>;
  toInfo(): SoftwareProviderInfo;
}
