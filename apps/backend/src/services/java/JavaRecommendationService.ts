import { APP_USER_AGENT, type JavaRecommendationResponse, type ServerSoftware } from "@serverlab/shared";
import { javaRuntimeRegistry } from "./JavaRuntimeRegistry.js";

interface PaperVersionMetadata {
  version?: {
    java?: {
      version?: {
        minimum?: number;
      };
    };
  };
}

export class JavaRecommendationService {
  async recommend(input: {
    minecraftVersion: string;
    software: ServerSoftware | string;
  }): Promise<JavaRecommendationResponse> {
    const metadataMajor = await this.tryProviderMetadata(input.minecraftVersion, input.software);
    const requiredMajor = metadataMajor ?? minimumJavaMajorForMinecraft(input.minecraftVersion);
    const confidence = metadataMajor ? "metadata" : requiredMajor ? "rules" : "unknown";
    const recommendedMajor = requiredMajor ?? 21;
    const installedRuntimes = await javaRuntimeRegistry.listRuntimes();
    const compatibleRuntime =
      installedRuntimes
        .filter((runtime) => runtime.status === "valid" && runtime.major >= recommendedMajor)
        .sort((a, b) => a.major - b.major || Number(a.source === "system") - Number(b.source === "system"))[0] ??
      null;
    const warnings: string[] = [];

    if (!requiredMajor) {
      warnings.push("Java compatibility is unknown for this version.");
    } else if (compatibleRuntime && compatibleRuntime.major > recommendedMajor) {
      warnings.push(`Java ${compatibleRuntime.major} is newer than the recommended Java ${recommendedMajor}.`);
    }

    return {
      minecraftVersion: input.minecraftVersion,
      software: input.software as ServerSoftware,
      requiredMajor: recommendedMajor,
      recommendedMajor,
      confidence,
      compatibleRuntime,
      installedRuntimes,
      missing: !compatibleRuntime,
      warnings,
    };
  }

  isCompatible(runtimeMajor: number, requiredMajor: number, allowUnsupported: boolean): boolean {
    if (runtimeMajor < requiredMajor) return false;
    if (runtimeMajor > requiredMajor && !allowUnsupported) return false;
    return true;
  }

  private async tryProviderMetadata(
    minecraftVersion: string,
    software: ServerSoftware | string
  ): Promise<number | null> {
    if (software !== "paper") return null;
    try {
      const response = await fetch(
        `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(minecraftVersion)}`,
        { headers: { Accept: "application/json", "User-Agent": APP_USER_AGENT } }
      );
      if (!response.ok) return null;
      const data = (await response.json()) as PaperVersionMetadata;
      return data.version?.java?.version?.minimum ?? null;
    } catch {
      return null;
    }
  }

}

/**
 * Fallback compatibility rules for providers without their own Java metadata.
 * Minecraft 1.21.9 and newer ship server classes compiled for Java 25, while
 * 1.21.8 and earlier in the 1.21 line remain Java 21-compatible.
 */
export function minimumJavaMajorForMinecraft(version: string): number | null {
  const normalized = version.trim();
  if (/^26(?:\.|$)/.test(normalized)) return 25;

  const match = normalized.match(/^1\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;

  const minor = Number(match[1]);
  const patch = Number(match[2] ?? 0);
  if (minor > 21 || (minor === 21 && patch >= 9)) return 25;
  if (minor === 21 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

export const javaRecommendationService = new JavaRecommendationService();
