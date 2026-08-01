import type { JavaPackageType, JavaRuntimeProviderId, JavaRuntimeProviderInfo } from "@serverlab/shared";
import type {
  JavaRuntimeProvider,
  JavaRuntimeProviderRequest,
  ResolvedJavaRuntime,
} from "./types.js";

const USER_AGENT = "ServerLabMC/2.1.0 (+https://serverlab.local)";

function assertHttps(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Java downloads must use HTTPS");
  return parsed;
}

export function assertAllowedJavaUrl(url: string, allowedHosts: string[]): URL {
  const parsed = assertHttps(url);
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(`Java download host is not allowed: ${parsed.hostname}`);
  }
  return parsed;
}

async function fetchJson<T>(url: string, allowedHosts: string[]): Promise<T> {
  assertAllowedJavaUrl(url, allowedHosts);
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`Runtime provider request failed (${response.status})`);
  return (await response.json()) as T;
}

async function fetchText(url: string, allowedHosts: string[]): Promise<string> {
  assertAllowedJavaUrl(url, allowedHosts);
  const response = await fetch(url, {
    headers: { Accept: "text/plain", "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`Runtime checksum request failed (${response.status})`);
  return response.text();
}

function platformOs(): string {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "mac";
  return "linux";
}

export function runtimeOs(): string {
  return platformOs();
}

export function runtimeArch(): string {
  if (process.arch === "x64") return "x64";
  if (process.arch === "arm64") return "aarch64";
  return process.arch;
}

abstract class BaseJavaProvider implements JavaRuntimeProvider {
  abstract id: JavaRuntimeProviderId;
  abstract label: string;
  abstract homepage: string;
  abstract supportedMajors: number[];
  abstract allowedHosts: string[];
  enabled = true;

  abstract resolveLatestRuntime(request: JavaRuntimeProviderRequest): Promise<ResolvedJavaRuntime>;

  validateResolvedRuntime(runtime: ResolvedJavaRuntime): void {
    assertAllowedJavaUrl(runtime.downloadUrl, this.allowedHosts);
    if (runtime.checksumUrl) assertAllowedJavaUrl(runtime.checksumUrl, this.allowedHosts);
    if (!this.supportedMajors.includes(runtime.major)) {
      throw new Error(`${this.label} does not support Java ${runtime.major}`);
    }
  }

  toInfo(): JavaRuntimeProviderInfo {
    return {
      id: this.id,
      label: this.label,
      homepage: this.homepage,
      supportedMajors: this.supportedMajors,
      enabled: this.enabled,
    };
  }
}

interface AdoptiumAsset {
  binary?: {
    image_type?: JavaPackageType;
    package?: {
      checksum?: string;
      checksum_link?: string;
      link?: string;
      metadata_link?: string;
      name?: string;
      size?: number;
    };
  };
  release_link?: string;
  release_name?: string;
  version?: {
    major?: number;
    openjdk_version?: string;
    semver?: string;
  };
}

class AdoptiumProvider extends BaseJavaProvider {
  id: JavaRuntimeProviderId = "adoptium";
  label = "Eclipse Temurin";
  homepage = "https://adoptium.net";
  supportedMajors = [8, 11, 17, 21, 25];
  allowedHosts = ["api.adoptium.net", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"];

  async resolveLatestRuntime(request: JavaRuntimeProviderRequest): Promise<ResolvedJavaRuntime> {
    const attempt = async (packageType: JavaPackageType) => {
      const url = `https://api.adoptium.net/v3/assets/latest/${request.major}/hotspot?architecture=${encodeURIComponent(
        request.arch
      )}&image_type=${packageType}&os=${encodeURIComponent(request.os)}&vendor=eclipse`;
      const assets = await fetchJson<AdoptiumAsset[]>(url, this.allowedHosts);
      return { asset: assets[0], packageType, metadataUrl: url };
    };

    let resolved = await attempt(request.packageType);
    if (!resolved.asset?.binary?.package?.link && request.packageType === "jre") {
      resolved = await attempt("jdk");
    }
    const pkg = resolved.asset?.binary?.package;
    if (!pkg?.link || !pkg.name) throw new Error(`No ${this.label} archive found for Java ${request.major}`);

    const archiveType = pkg.name.endsWith(".zip") ? "zip" : "tar.gz";
    const runtime: ResolvedJavaRuntime = {
      provider: this.id,
      distribution: "Temurin",
      major: request.major,
      version:
        resolved.asset?.version?.openjdk_version ??
        resolved.asset?.version?.semver ??
        resolved.asset?.release_name ??
        String(request.major),
      os: request.os,
      arch: request.arch,
      packageType: resolved.packageType,
      archiveType,
      downloadUrl: pkg.link,
      checksum: pkg.checksum,
      checksumUrl: pkg.checksum_link,
      sizeBytes: pkg.size,
      licenseUrl: "https://adoptium.net/about/",
      releaseMetadataUrl: pkg.metadata_link ?? resolved.metadataUrl,
      filename: pkg.name,
    };
    this.validateResolvedRuntime(runtime);
    return runtime;
  }
}

class MicrosoftOpenJdkProvider extends BaseJavaProvider {
  id: JavaRuntimeProviderId = "microsoft";
  label = "Microsoft OpenJDK";
  homepage = "https://learn.microsoft.com/en-us/java/openjdk/";
  supportedMajors = [11, 17, 21, 25];
  allowedHosts = ["aka.ms", "download.visualstudio.microsoft.com"];

  async resolveLatestRuntime(request: JavaRuntimeProviderRequest): Promise<ResolvedJavaRuntime> {
    const osPart =
      request.os === "windows" ? "windows" : request.os === "mac" ? "macOS" : "linux";
    const ext = request.os === "windows" ? "zip" : "tar.gz";
    const arch = request.arch === "aarch64" ? "aarch64" : "x64";
    const filename = `microsoft-jdk-${request.major}-${osPart}-${arch}.${ext}`;
    const downloadUrl = `https://aka.ms/download-jdk/${filename}`;
    const checksumUrl = `${downloadUrl}.sha256sum.txt`;
    let checksum: string | undefined;
    try {
      const text = await fetchText(checksumUrl, this.allowedHosts);
      checksum = text.match(/[a-fA-F0-9]{64}/)?.[0];
    } catch {
      checksum = undefined;
    }

    const runtime: ResolvedJavaRuntime = {
      provider: this.id,
      distribution: "Microsoft OpenJDK",
      major: request.major,
      version: String(request.major),
      os: request.os,
      arch: request.arch,
      packageType: "jdk",
      archiveType: ext === "zip" ? "zip" : "tar.gz",
      downloadUrl,
      checksum,
      checksumUrl,
      licenseUrl: "https://learn.microsoft.com/en-us/java/openjdk/faq",
      releaseMetadataUrl: "https://learn.microsoft.com/en-us/java/openjdk/download-major-urls",
      filename,
    };
    this.validateResolvedRuntime(runtime);
    return runtime;
  }
}

export class JavaRuntimeProviderRegistry {
  private readonly providers = new Map<JavaRuntimeProviderId, JavaRuntimeProvider>();

  constructor() {
    [new AdoptiumProvider(), new MicrosoftOpenJdkProvider()].forEach((provider) =>
      this.providers.set(provider.id, provider)
    );
  }

  list(): JavaRuntimeProviderInfo[] {
    return [...this.providers.values()].map((provider) => provider.toInfo());
  }

  get(id: JavaRuntimeProviderId): JavaRuntimeProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown Java runtime provider: ${id}`);
    return provider;
  }

  async resolveWithFallback(input: {
    provider?: JavaRuntimeProviderId;
    major: number;
    packageType?: JavaPackageType;
  }): Promise<ResolvedJavaRuntime> {
    const os = runtimeOs();
    const arch = runtimeArch();
    const packageType = input.packageType ?? "jre";
    const order = input.provider
      ? [this.get(input.provider)]
      : [this.get("adoptium"), this.get("microsoft")];
    let lastError: unknown;
    for (const provider of order) {
      try {
        return await provider.resolveLatestRuntime({
          major: input.major,
          os,
          arch,
          packageType,
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No Java runtime provider could resolve an archive");
  }
}

export const javaRuntimeProviderRegistry = new JavaRuntimeProviderRegistry();
