import type {
  ModrinthProject,
  ModrinthVersion,
  PluginCompatibility,
  ServerFramework,
} from "@serverlab/shared";

const LOADER_ALIASES: Record<ServerFramework, string[]> = {
  paper: ["paper", "spigot", "bukkit"],
  purpur: ["purpur", "paper", "spigot", "bukkit"],
  folia: ["folia", "paper", "spigot", "bukkit"],
  spigot: ["spigot", "bukkit"],
  fabric: ["fabric"],
  vanilla: [],
};

export class PluginCompatibilityService {
  check(
    server: { software: string; version: string },
    candidate: Pick<ModrinthProject | ModrinthVersion, "loaders" | "gameVersions">
  ): PluginCompatibility {
    const software = server.software as ServerFramework;
    if (software === "vanilla") {
      return {
        status: "incompatible",
        reason: "Vanilla servers do not support plugins.",
        matchedLoaders: [],
        matchedVersions: [],
      };
    }
    const acceptedLoaders = LOADER_ALIASES[software] ?? [server.software];
    const candidateLoaders = candidate.loaders.map((loader) => loader.toLowerCase());
    const matchedLoaders = acceptedLoaders.filter((loader) =>
      candidateLoaders.includes(loader)
    );
    const matchedVersions = candidate.gameVersions.filter((version) => version === server.version);

    if (matchedLoaders.length === 0) {
      return {
        status: "incompatible",
        reason: `This project does not list ${server.software} compatible loaders.`,
        matchedLoaders,
        matchedVersions,
      };
    }

    if (matchedVersions.length === 0) {
      return {
        status: "warning",
        reason: `Loader matches, but Minecraft ${server.version} is not listed.`,
        matchedLoaders,
        matchedVersions,
      };
    }

    return {
      status: "compatible",
      reason: `Compatible with ${server.software} ${server.version}.`,
      matchedLoaders,
      matchedVersions,
    };
  }

  withProjectCompatibility<T extends ModrinthProject>(
    server: { software: string; version: string } | null,
    project: T
  ): T & { compatibility: PluginCompatibility | null } {
    return {
      ...project,
      compatibility: server ? this.check(server, project) : null,
    };
  }

  withVersionCompatibility<T extends ModrinthVersion>(
    server: { software: string; version: string } | null,
    version: T
  ): T {
    return {
      ...version,
      compatibility: server ? this.check(server, version) : null,
    };
  }
}

export const pluginCompatibilityService = new PluginCompatibilityService();
