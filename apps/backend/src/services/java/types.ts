import type {
  JavaPackageType,
  JavaRuntimeProviderId,
  JavaRuntimeProviderInfo,
} from "@serverlab/shared";

export interface JavaRuntimeProviderRequest {
  major: number;
  os: string;
  arch: string;
  packageType: JavaPackageType;
}

export interface ResolvedJavaRuntime {
  provider: JavaRuntimeProviderId;
  distribution: string;
  major: number;
  version: string;
  os: string;
  arch: string;
  packageType: JavaPackageType;
  archiveType: "zip" | "tar.gz";
  downloadUrl: string;
  checksum?: string;
  checksumUrl?: string;
  sizeBytes?: number;
  licenseUrl?: string;
  releaseMetadataUrl?: string;
  filename: string;
}

export interface JavaRuntimeProvider {
  id: JavaRuntimeProviderId;
  label: string;
  homepage: string;
  supportedMajors: number[];
  allowedHosts: string[];
  enabled: boolean;
  resolveLatestRuntime(request: JavaRuntimeProviderRequest): Promise<ResolvedJavaRuntime>;
  validateResolvedRuntime(runtime: ResolvedJavaRuntime): void;
  toInfo(): JavaRuntimeProviderInfo;
}
