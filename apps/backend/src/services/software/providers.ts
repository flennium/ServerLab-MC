import fs from "fs/promises";
import crypto from "crypto";
import {
  APP_USER_AGENT,
  type ServerFramework,
  type ServerKind,
  type SoftwareBuild,
  type SoftwareProviderInfo,
} from "@serverlab/shared";
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

async function calculateSha1(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

abstract class BaseProvider implements SoftwareProvider {
  abstract id: ServerFramework;
  abstract label: string;
  abstract homepage: string;
  abstract enabled: boolean;
  abstract supportsBuildSelection: boolean;
  acquisition: "download" | "build" = "download";
  kind: ServerKind = "server";
  releaseSource: "provider" | "minecraft-release-metadata" | "jenkins" = "provider";
  requiresEula = true;
  recommendedJavaMajor?: number;
  minimumJavaMajor?: number;
  pluginLoaders: string[] = [];
  configFormat: "properties" | "yaml" | "toml" | "none" = "none";
  deprecated?: boolean;
  warning?: string;
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
    if (stat.size < 4) {
      throw new Error("Downloaded server artifact is empty or incomplete");
    }
    const handle = await fs.open(filePath, "r");
    try {
      const header = Buffer.alloc(4);
      await handle.read(header, 0, header.length, 0);
      if (header[0] !== 0x50 || header[1] !== 0x4b) {
        throw new Error("Downloaded server artifact is not a valid jar archive");
      }
    } finally {
      await handle.close();
    }
    if (artifactMeta.expectedSizeBytes && stat.size !== artifactMeta.expectedSizeBytes) {
      throw new Error("Downloaded file size does not match provider metadata");
    }
    if (artifactMeta.sha256) {
      const actual = await calculateSha256(filePath);
      if (actual.toLowerCase() !== artifactMeta.sha256.toLowerCase()) {
        throw new Error("Downloaded file checksum does not match provider metadata");
      }
    }
    if (artifactMeta.sha1) {
      const actual = await calculateSha1(filePath);
      if (actual.toLowerCase() !== artifactMeta.sha1.toLowerCase()) {
        throw new Error("Downloaded file SHA-1 does not match provider metadata");
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
      kind: this.kind,
      releaseSource: this.releaseSource,
      requiresEula: this.requiresEula,
      recommendedJavaMajor: this.recommendedJavaMajor,
      minimumJavaMajor: this.minimumJavaMajor,
      pluginLoaders: this.pluginLoaders,
      configFormat: this.configFormat,
      deprecated: this.deprecated,
      warning: this.warning,
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

interface PaperProxyVersionResponse {
  builds?: Array<number | { id?: string | number; channel?: string }>;
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
  pluginLoaders = ["paper", "spigot", "bukkit"];
  configFormat = "properties" as const;

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

class FoliaProvider extends BaseProvider {
  id: ServerFramework = "folia";
  label = "Folia";
  homepage = "https://papermc.io/software/folia";
  enabled = true;
  supportsBuildSelection = true;
  allowedHosts = ["fill.papermc.io", "fill-data.papermc.io"];
  pluginLoaders = ["folia", "paper", "spigot", "bukkit"];
  configFormat = "properties" as const;

  async listMinecraftVersions(): Promise<string[]> {
    const data = await fetchJson<PaperProjectResponse>(
      "https://fill.papermc.io/v3/projects/folia",
      this.allowedHosts
    );
    return Object.values(data.versions ?? {}).flat();
  }

  async listBuilds(minecraftVersion: string): Promise<SoftwareBuild[]> {
    const data = await fetchJson<PaperVersionResponse>(
      `https://fill.papermc.io/v3/projects/folia/versions/${encodeURIComponent(minecraftVersion)}`,
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

  async resolveArtifact({ minecraftVersion, buildId }: ResolveArtifactRequest): Promise<SoftwareArtifactMeta> {
    const metadataUrl = `https://fill.papermc.io/v3/projects/folia/versions/${encodeURIComponent(minecraftVersion)}/builds/${encodeURIComponent(buildId)}`;
    const data = await fetchJson<PaperBuildResponse>(metadataUrl, this.allowedHosts);
    const download = data.downloads?.["server:default"];
    if (!download?.name || !download.url) throw new Error("Folia build does not expose a server jar download");

    return {
      provider: this.id,
      acquisition: "download",
      minecraftVersion,
      buildId,
      filename: download.name,
      expectedSizeBytes: download.size,
      sha256: download.checksums?.sha256,
      upstreamMetadataUrl: metadataUrl,
      downloadUrl: download.url,
      licenseNotes: "Folia server software is downloaded from PaperMC.",
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
  pluginLoaders = ["purpur", "paper", "spigot", "bukkit"];
  configFormat = "properties" as const;

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
  pluginLoaders = ["fabric"];
  configFormat = "properties" as const;

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

interface MojangVersionEntry {
  id: string;
  type?: string;
  url: string;
}

interface MojangManifestResponse {
  versions?: MojangVersionEntry[];
}

interface MojangServerVersionResponse {
  downloads?: {
    server?: {
      sha1?: string;
      size?: number;
      url?: string;
    };
  };
}

class VanillaProvider extends BaseProvider {
  id: ServerFramework = "vanilla";
  label = "Vanilla";
  homepage = "https://www.minecraft.net/download/server";
  enabled = true;
  supportsBuildSelection = true;
  supportedRevisionSource = "minecraft-release-metadata" as const;
  allowedHosts = ["piston-meta.mojang.com", "piston-data.mojang.com", "launchermeta.mojang.com"];
  configFormat = "properties" as const;

  async listMinecraftVersions(): Promise<string[]> {
    const data = await fetchJson<MojangManifestResponse>(
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
      label: "Official Vanilla server jar",
      recommended: true,
    }];
  }

  async resolveArtifact({ minecraftVersion, buildId }: ResolveArtifactRequest): Promise<SoftwareArtifactMeta> {
    if (minecraftVersion !== buildId) throw new Error("Vanilla builds must match the selected Minecraft release");
    const manifest = await fetchJson<MojangManifestResponse>(
      "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
      this.allowedHosts
    );
    const version = manifest.versions?.find((entry) => entry.id === minecraftVersion);
    if (!version?.url) throw new Error(`Minecraft release metadata was not found for ${minecraftVersion}`);
    if (version.type !== "release") throw new Error("Vanilla only supports official Minecraft releases");
    const metadata = await fetchJson<MojangServerVersionResponse>(version.url, this.allowedHosts);
    const server = metadata.downloads?.server;
    if (!server?.url) throw new Error(`Vanilla ${minecraftVersion} does not expose an official server download`);

    return {
      provider: this.id,
      acquisition: "download",
      minecraftVersion,
      buildId,
      filename: `minecraft_server.${minecraftVersion}.jar`,
      expectedSizeBytes: server.size,
      sha1: server.sha1,
      upstreamMetadataUrl: version.url,
      downloadUrl: server.url,
      licenseNotes: "Vanilla server software is downloaded from Mojang's official version metadata.",
    };
  }
}

class PaperProxyProvider extends BaseProvider {
  constructor(
    public readonly id: ServerFramework,
    public readonly label: string,
    public readonly homepage: string,
    public readonly configFormat: "yaml" | "toml",
    public readonly pluginLoaders: string[],
    public readonly recommendedJavaMajor: number,
    public readonly minimumJavaMajor: number,
    public readonly deprecated = false,
    public readonly warning?: string
  ) {
    super();
  }

  enabled = true;
  supportsBuildSelection = true;
  kind: ServerKind = "proxy";
  releaseSource = "provider" as const;
  requiresEula = false;
  allowedHosts = ["fill.papermc.io", "fill-data.papermc.io"];

  private projectName(): "velocity" | "waterfall" {
    return this.id === "velocity" ? "velocity" : "waterfall";
  }

  async listMinecraftVersions(): Promise<string[]> {
    const data = await fetchJson<PaperProjectResponse>(
      `https://fill.papermc.io/v3/projects/${this.projectName()}`,
      this.allowedHosts
    );
    return Object.values(data.versions ?? {}).flat();
  }

  async listBuilds(version: string): Promise<SoftwareBuild[]> {
    const data = await fetchJson<PaperProxyVersionResponse>(
      `https://fill.papermc.io/v3/projects/${this.projectName()}/versions/${encodeURIComponent(version)}`,
      this.allowedHosts
    );
    const builds = (data.builds ?? []).filter((build) =>
      typeof build === "number" || (Boolean(build.id) && build.channel?.toUpperCase() === "STABLE")
    );
    return builds.map((build, index) => {
      const id = typeof build === "number" ? String(build) : String(build.id);
      return { id, label: `Stable build ${id}`, recommended: index === 0 };
    });
  }

  async resolveArtifact({ minecraftVersion, buildId }: ResolveArtifactRequest): Promise<SoftwareArtifactMeta> {
    const metadataUrl = `https://fill.papermc.io/v3/projects/${this.projectName()}/versions/${encodeURIComponent(minecraftVersion)}/builds/${encodeURIComponent(buildId)}`;
    const data = await fetchJson<PaperBuildResponse>(metadataUrl, this.allowedHosts);
    const download = data.downloads?.["server:default"];
    if (!download?.name || !download.url) {
      throw new Error(`${this.label} build does not expose an official server jar download`);
    }
    assertAllowedHttpsUrl(download.url, this.allowedHosts);
    return {
      provider: this.id,
      acquisition: "download",
      minecraftVersion,
      buildId,
      filename: download.name,
      expectedSizeBytes: download.size,
      sha256: download.checksums?.sha256,
      upstreamMetadataUrl: metadataUrl,
      downloadUrl: download.url,
      licenseNotes: `${this.label} is downloaded from the official PaperMC downloads service.`,
    };
  }
}

interface JenkinsBuildResponse {
  lastStableBuild?: { number?: number };
  lastSuccessfulBuild?: { number?: number };
  artifacts?: Array<{ fileName?: string; relativePath?: string }>;
}

class BungeeCordProvider extends BaseProvider {
  id: ServerFramework = "bungeecord";
  label = "BungeeCord";
  homepage = "https://github.com/SpigotMC/BungeeCord";
  enabled = true;
  supportsBuildSelection = true;
  kind: ServerKind = "proxy";
  releaseSource = "jenkins" as const;
  requiresEula = false;
  recommendedJavaMajor = 17;
  minimumJavaMajor = 17;
  pluginLoaders = ["bungeecord"];
  configFormat = "yaml" as const;
  deprecated = true;
  warning = "BungeeCord is a legacy proxy. Velocity is recommended for new networks.";
  allowedHosts = ["hub.spigotmc.org"];

  private async latestBuild(): Promise<number> {
    const data = await fetchJson<JenkinsBuildResponse>(
      "https://hub.spigotmc.org/jenkins/job/BungeeCord/api/json?tree=lastStableBuild[number],lastSuccessfulBuild[number]",
      this.allowedHosts
    );
    const number = data.lastStableBuild?.number ?? data.lastSuccessfulBuild?.number;
    if (!number) throw new Error("Official BungeeCord build metadata is unavailable");
    return number;
  }

  async listMinecraftVersions(): Promise<string[]> {
    return [String(await this.latestBuild())];
  }

  async listBuilds(buildVersion: string): Promise<SoftwareBuild[]> {
    if (!/^\d+$/.test(buildVersion)) throw new Error("Invalid BungeeCord build number");
    return [{ id: buildVersion, label: `Official Jenkins build #${buildVersion}`, recommended: true }];
  }

  async resolveArtifact({ minecraftVersion, buildId }: ResolveArtifactRequest): Promise<SoftwareArtifactMeta> {
    if (!/^\d+$/.test(buildId)) throw new Error("Invalid BungeeCord build number");
    const metadataUrl = `https://hub.spigotmc.org/jenkins/job/BungeeCord/${encodeURIComponent(buildId)}/api/json?tree=artifacts[fileName,relativePath]`;
    const data = await fetchJson<JenkinsBuildResponse>(metadataUrl, this.allowedHosts);
    const artifact = data.artifacts?.find((entry) =>
      entry.fileName === "BungeeCord.jar" || entry.relativePath?.endsWith("bootstrap/target/BungeeCord.jar")
    );
    if (!artifact?.relativePath) throw new Error("Official BungeeCord Jenkins build has no server jar artifact");
    const downloadUrl = `https://hub.spigotmc.org/jenkins/job/BungeeCord/${encodeURIComponent(buildId)}/artifact/${artifact.relativePath}`;
    assertAllowedHttpsUrl(downloadUrl, this.allowedHosts);
    return {
      provider: this.id,
      acquisition: "download",
      minecraftVersion,
      buildId,
      filename: "BungeeCord.jar",
      upstreamMetadataUrl: metadataUrl,
      downloadUrl,
      licenseNotes: "BungeeCord is downloaded from the official Spigot Jenkins distribution.",
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
  pluginLoaders = ["spigot", "bukkit"];
  configFormat = "properties" as const;

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
    [
      new PaperProvider(),
      new PurpurProvider(),
      new FoliaProvider(),
      new FabricProvider(),
      new VanillaProvider(),
      new SpigotProvider(),
      new PaperProxyProvider(
        "velocity",
        "Velocity",
        "https://papermc.io/software/velocity",
        "toml",
        ["velocity"],
        21,
        21
      ),
      new PaperProxyProvider(
        "waterfall",
        "Waterfall",
        "https://papermc.io/software/waterfall",
        "yaml",
        ["waterfall", "bungeecord"],
        11,
        8,
        true,
        "Waterfall is end-of-life. Velocity is recommended for new networks."
      ),
      new BungeeCordProvider(),
    ].forEach(
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
