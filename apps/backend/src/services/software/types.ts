import type { ServerFramework, SoftwareBuild, SoftwareProviderInfo } from "@serverlab/shared";

export interface SoftwareArtifactMeta {
  provider: ServerFramework;
  minecraftVersion: string;
  buildId: string;
  filename: string;
  downloadUrl: string;
  expectedSizeBytes?: number;
  sha256?: string;
  upstreamMetadataUrl?: string;
  licenseNotes?: string;
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
  allowedHosts: string[];
  reasonUnavailable?: string;
  listMinecraftVersions(): Promise<string[]>;
  listBuilds(minecraftVersion: string): Promise<SoftwareBuild[]>;
  resolveArtifact(request: ResolveArtifactRequest): Promise<SoftwareArtifactMeta>;
  validateArtifact(filePath: string, artifactMeta: SoftwareArtifactMeta): Promise<void>;
  toInfo(): SoftwareProviderInfo;
}
