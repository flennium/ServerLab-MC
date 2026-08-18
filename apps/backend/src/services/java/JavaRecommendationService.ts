import { APP_USER_AGENT, type JavaRecommendationResponse, type ServerSoftware } from "@serverlab/shared";
import { prisma } from "../../lib/prisma.js";
import { javaRuntimeRegistry } from "./JavaRuntimeRegistry.js";
import { javaRequirementDetectionService } from "./JavaRequirementDetectionService.js";

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
    artifactPath?: string;
    serverId?: string;
  }): Promise<JavaRecommendationResponse> {
    const detection = input.artifactPath
      ? await javaRequirementDetectionService.detect(input.artifactPath)
      : null;
    const jarMajor = detection?.requiredMajor ?? null;
    const providerMetadataMajor = jarMajor
      ? null
      : await this.tryProviderMetadata(input.minecraftVersion, input.software);
    const proxyRule = proxyJavaRule(input.software, input.minecraftVersion);
    const fallbackMajor = proxyRule?.minimum ?? minimumJavaMajorForMinecraft(input.minecraftVersion);
    const requiredMajor = jarMajor ?? providerMetadataMajor ?? fallbackMajor;
    const confidence = jarMajor
      ? "jar"
      : providerMetadataMajor
        ? "metadata"
        : requiredMajor
          ? detection?.method === "ambiguous"
            ? "fallback"
            : "rules"
          : "unknown";
    const recommendedMajor = jarMajor ?? providerMetadataMajor ?? proxyRule?.recommended ?? requiredMajor ?? 21;
    const selectionMajor = requiredMajor ?? recommendedMajor;
    const installedRuntimes = await javaRuntimeRegistry.listRuntimes();
    const compatibleRuntime =
      installedRuntimes
        .filter((runtime) => runtime.status === "valid" && runtime.major >= selectionMajor)
        .sort((a, b) => a.major - b.major || Number(a.source === "system") - Number(b.source === "system"))[0] ??
      null;
    const warnings: string[] = [...(detection?.warnings ?? [])];

    if (!requiredMajor) {
      warnings.push("Java compatibility is unknown for this version.");
    } else if (compatibleRuntime && compatibleRuntime.major > recommendedMajor) {
      warnings.push(`Java ${compatibleRuntime.major} is newer than the recommended Java ${recommendedMajor}.`);
    }

    if (detection?.confidence === "low" || detection?.confidence === "unknown") {
      warnings.push("The JAR requirement could not be confirmed from class files; the displayed Java version is a safe provider fallback.");
    }

    if (input.serverId && detection) {
      await prisma.server.update({
        where: { id: input.serverId },
        data: {
          javaRequirementMajor: detection.requiredMajor,
          javaRequirementConfidence: detection.confidence,
          javaRequirementMethod: detection.method,
          javaRequirementDetails: JSON.stringify({ indicators: detection.indicators, warnings: detection.warnings }),
          javaRequirementDetectedAt: new Date(),
        },
      }).catch(() => {});
    }

    return {
      minecraftVersion: input.minecraftVersion,
      software: input.software as ServerSoftware,
      requiredMajor: requiredMajor ?? recommendedMajor,
      recommendedMajor,
      confidence,
      detection,
      compatibleRuntime,
      installedRuntimes,
      missing: !compatibleRuntime,
      warnings,
    };
  }

  isCompatible(
    runtimeMajor: number,
    requiredMajor: number,
    allowUnsupported: boolean,
    software?: string
  ): boolean {
    if (runtimeMajor < requiredMajor) return false;
    if (software === "waterfall") return true;
    if (runtimeMajor > requiredMajor && !allowUnsupported) return false;
    return true;
  }

  private async tryProviderMetadata(
    minecraftVersion: string,
    software: ServerSoftware | string
  ): Promise<number | null> {
    if (software !== "paper" && software !== "folia") return null;
    try {
      const response = await fetch(
        `https://fill.papermc.io/v3/projects/${software}/versions/${encodeURIComponent(minecraftVersion)}`,
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

function proxyJavaRule(
  software: string,
  _version: string
): { minimum: number; recommended: number } | null {
  switch (software) {
    case "velocity":
      return { minimum: 25, recommended: 25 };
    case "waterfall":
      return { minimum: 8, recommended: 11 };
    case "bungeecord":
      return { minimum: 17, recommended: 17 };
    default:
      return null;
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
