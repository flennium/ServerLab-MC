import fs from "fs/promises";
import crypto from "crypto";
import { APP_USER_AGENT, type ServerFramework, type SoftwareBuild, type SoftwareProviderInfo } from "@serverlab/shared";
import type {
  ResolveArtifactRequest,
  SoftwareArtifactMeta,
  SoftwareProvider,
} from "./types.js";

const USER_AGENT = APP_USER_AGENT;

async function fetchJson<T>(url: string, allowedHosts: string[]): Promise<T> {
  assertAllowedHttpsUrl(url, allowedHosts);
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Provider request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export function assertAllowedHttpsUrl(url: string, allowedHosts: string[]): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Software downloads must use HTTPS");
  }
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(`Download host is not allowed: ${parsed.hostname}`);
  }
  return parsed;
}

async function calculateSha256(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

abstract class BaseProvider implements SoftwareProvider {
  abstract id: ServerFramework;
  abstract label: string;
  abstract homepage: string;
  abstract enabled: boolean;
  abstract supportsBuildSelection: boolean;
  acquisition: "download" | "build" = "download";
  supportedRevisionSource?: "provider" | "minecraft-release-metadata";
  requiresJdk?: boolean;
  buildTool?: string;
  abstract allowedHosts: string[];
  reasonUnavailable?: string;

  abstract listMinecraftVersions(): Promise<string[]>;
  abstract listBuilds(minecraftVersion: string): Promise<SoftwareBuild[]>;
  abstract resolveArtifact(request: ResolveArtifactRequest): Promise<SoftwareArtifactMeta>;

  async validateArtifact(filePath: string, artifactMeta: SoftwareArtifactMeta): Promise<void> {
    const stat = await fs.stat(filePath);
    if (artifactMeta.expectedSizeBytes && stat.size !== artifactMeta.expectedSizeBytes) {
      throw new Error("Downloaded file size does not match provider metadata");
    }
    if (artifactMeta.sha256) {
      const actual = await calculateSha256(filePath);
      if (actual.toLowerCase() !== artifactMeta.sha256.toLowerCase()) {
        throw new Error("Downloaded file checksum does not match provider metadata");
      }
    }
  }

  toInfo(): SoftwareProviderInfo {
    return {
      id: this.id,
      label: this.label,
      homepage: this.homepage,
      enabled: this.enabled,
      supportsBuildSelection: this.supportsBuildSelection,
      acquisition: this.acquisition,
      supportedRevisionSource: this.supportedRevisionSource,
      requiresJdk: this.requiresJdk,
      buildTool: this.buildTool,
      reasonUnavailable: this.reasonUnavailable,
    };
  }
}

interface PaperProjectResponse {
  versions?: Record<string, string[]>;
}

interface PaperVersionResponse {
  builds?: number[];
}

interface PaperBuildResponse {
  downloads?: {
    "server:default"?: {
      name?: string;
      size?: number;
      url?: string;
      checksums?: {
        sha256?: string;
      };
    };
  };
}

class PaperProvider extends BaseProvider {
  id: ServerFramework = "paper";
  label = "Paper";
  homepage = "https://papermc.io/software/paper";
  enabled = true;
  supportsBuildSelection = true;
  allowedHosts = ["fill.papermc.io", "fill-data.papermc.io"];

  async listMinecraftVersions(): Promise<string[]> {
    const data = await fetchJson<PaperProjectResponse>(
      "https://fill.papermc.io/v3/projects/paper",
      this.allowedHosts
    );
    return Object.values(data.versions ?? {}).flat();
  }

  async listBuilds(minecraftVersion: string): Promise<SoftwareBuild[]> {
    const data = await fetchJson<PaperVersionResponse>(
      `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(minecraftVersion)}`,
      this.allowedHosts
    );
    const builds = data.builds ?? [];
    const latest = builds[0];
    return builds.map((build) => ({
      id: String(build),
      label: `Build ${build}`,
      recommended: build === latest,
    }));
  }

  async resolveArtifact({
    minecraftVersion,
    buildId,
  }: ResolveArtifactRequest): Promise<SoftwareArtifactMeta> {
    const metadataUrl = `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(
      minecraftVersion
    )}/builds/${encodeURIComponent(buildId)}`;
    const data = await fetchJson<PaperBuildResponse>(metadataUrl, this.allowedHosts);
    const download = data.downloads?.["server:default"];
    const filename = download?.name;
    if (!filename) throw new Error("Paper build does not expose a server jar download");
    if (!download?.url) throw new Error("Paper build does not expose a download URL");

    return {
      provider: this.id,
      acquisition: "download",
      minecraftVersion,
      buildId,
      filename,
      expectedSizeBytes: download.size,
      sha256: download.checksums?.sha256,
      upstreamMetadataUrl: metadataUrl,
      downloadUrl: download.url,
      licenseNotes: "Paper server software is downloaded from PaperMC.",
    };
  }
}

interface PurpurVersionsResponse {
  versions?: string[];
}

interface PurpurBuildsResponse {
  builds?: string[] | { all?: string[]; latest?: string };
}

interface PurpurBuildResponse {
  downloads?: {
    application?: {
      name?: string;
      md5?: string;
    };
  };
}

class PurpurProvider extends BaseProvider {
  id: ServerFramework = "purpur";
  label = "Purpur";
  homepage = "https://purpurmc.org";
  enabled = true;
  supportsBuildSelection = true;
  allowedHosts = ["api.purpurmc.org"];

  async listMinecraftVersions(): Promise<string[]> {
    const data = await fetchJson<PurpurVersionsResponse>(
      "https://api.purpurmc.org/v2/purpur/",
      this.allowedHosts
    );
    return [...(data.versions ?? [])].reverse();
  }

  async listBuilds(minecraftVersion: string): Promise<SoftwareBuild[]> {
    const data = await fetchJson<PurpurBuildsResponse>(
      `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(minecraftVersion)}`,
      this.allowedHosts
    );
    const all = Array.isArray(data.builds) ? data.builds : data.builds?.all ?? [];
    const latest = Array.isArray(data.builds)
      ? all[all.length - 1]
      : data.builds?.latest ?? all[all.length - 1];
    return [...all].reverse().map((build) => ({
      id: String(build),
      label: `Build ${build}`,
      recommended: String(build) === String(latest),
    }));
  }

  async resolveArtifact({
    minecraftVersion,
    buildId,
  }: ResolveArtifactRequest): Promise<SoftwareArtifactMeta> {
    const metadataUrl = `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(
      minecraftVersion
    )}/${encodeURIComponent(buildId)}`;
    const data = await fetchJson<PurpurBuildResponse>(metadataUrl, this.allowedHosts);
    const filename =
      data.downloads?.application?.name ?? `purpur-${minecraftVersion}-${buildId}.jar`;

    return {
      provider: this.id,
      acquisition: "download",
      minecraftVersion,
      buildId,
      filename,
      upstreamMetadataUrl: metadataUrl,
      downloadUrl: `${metadataUrl}/download`,
      licenseNotes: "Purpur server software is downloaded from PurpurMC.",
    };
  }
}

interface FabricGameVersion {
  version: string;
  stable?: boolean;
}

interface FabricLoaderVersion {
  version: string;
  stable?: boolean;
}

interface FabricInstallerVersion {
  version: string;
  stable?: boolean;
}

class FabricProvider extends BaseProvider {
  id: ServerFramework = "fabric";
  label = "Fabric";
  homepage = "https://fabricmc.net";
  enabled = true;
  supportsBuildSelection = true;
  allowedHosts = ["meta.fabricmc.net"];

  async listMinecraftVersions(): Promise<string[]> {
    const data = await fetchJson<FabricGameVersion[]>(
      "https://meta.fabricmc.net/v2/versions/game",
      this.allowedHosts
    );
    return data.filter((entry) => entry.stable !== false).map((entry) => entry.version);
  }

  async listBuilds(_minecraftVersion: string): Promise<SoftwareBuild[]> {
    const [loaders, installers] = await Promise.all([
      fetchJson<FabricLoaderVersion[]>(
        "https://meta.fabricmc.net/v2/versions/loader",
        this.allowedHosts
      ),
      fetchJson<FabricInstallerVersion[]>(
        "https://meta.fabricmc.net/v2/versions/installer",
        this.allowedHosts
      ),
    ]);
    const installer = installers.find((entry) => entry.stable !== false) ?? installers[0];
    if (!installer) throw new Error("Fabric installer metadata is unavailable");

    return loaders
      .filter((entry) => entry.stable !== false)
      .slice(0, 20)
      .map((loader, index) => ({
        id: `${loader.version}+installer.${installer.version}`,
        label: `Loader ${loader.version}`,
        recommended: index === 0,
      }));
  }

  async resolveArtifact({
    minecraftVersion,
    buildId,
  }: ResolveArtifactRequest): Promise<SoftwareArtifactMeta> {
    const [loaderVersion, installerVersion] = buildId.split("+installer.");
    if (!loaderVersion || !installerVersion) {
      throw new Error("Invalid Fabric build id");
    }

    return {
      provider: this.id,
      acquisition: "download",
      minecraftVersion,
      buildId,
      filename: `fabric-server-${minecraftVersion}-${loaderVersion}.jar`,
      upstreamMetadataUrl: "https://meta.fabricmc.net/v2/versions",
      downloadUrl: `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(
        minecraftVersion
      )}/${encodeURIComponent(loaderVersion)}/${encodeURIComponent(installerVersion)}/server/jar`,
      licenseNotes: "Fabric server launcher is generated by Fabric Meta.",
    };
  }
}

class SpigotProvider extends BaseProvider {
  id: ServerFramework = "spigot";
  label = "Spigot";
  homepage = "https://www.spigotmc.org";
  enabled = true;
  supportsBuildSelection = true;
  acquisition = "build" as const;
  supportedRevisionSource = "minecraft-release-metadata" as const;
  requiresJdk = true;
  buildTool = "spigot-buildtools";
  allowedHosts = ["piston-meta.mojang.com", "launchermeta.mojang.com"];

  async listMinecraftVersions(): Promise<string[]> {
    const data = await fetchJson<{ versions?: Array<{ id: string; type?: string }> }>(
      "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
      this.allowedHosts
    );
    return (data.versions ?? [])
      .filter((version) => version.type === "release")
      .map((version) => version.id);
  }

  async listBuilds(minecraftVersion: string): Promise<SoftwareBuild[]> {
    return [{
      id: minecraftVersion,
      label: "Build locally with BuildTools",
      recommended: true,
    }];
  }

  async resolveArtifact(_request: ResolveArtifactRequest): Promise<SoftwareArtifactMeta> {
    throw new Error("Spigot artifacts are produced by the BuildTools workflow");
  }
}

export class SoftwareProviderRegistry {
  private readonly providers = new Map<ServerFramework, SoftwareProvider>();

  constructor() {
    [new PaperProvider(), new PurpurProvider(), new FabricProvider(), new SpigotProvider()].forEach(
      (provider) => this.providers.set(provider.id, provider)
    );
  }

  list(): SoftwareProviderInfo[] {
    return [...this.providers.values()].map((provider) => provider.toInfo());
  }

  get(id: ServerFramework): SoftwareProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown software provider: ${id}`);
    if (!provider.enabled) {
      throw new Error(provider.reasonUnavailable ?? `${provider.label} is not available`);
    }
    return provider;
  }

  find(id: ServerFramework): SoftwareProvider | undefined {
    return this.providers.get(id);
  }
}

export const softwareProviderRegistry = new SoftwareProviderRegistry();
