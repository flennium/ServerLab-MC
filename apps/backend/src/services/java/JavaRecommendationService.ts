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
    const jarMajor = detection?.minimumMajor ?? detection?.requiredMajor ?? null;
    const providerMetadata = jarMajor || detection?.status === "confirmed"
      ? null
      : await this.tryProviderMetadata(input.minecraftVersion, input.software);
    const proxyRule = proxyJavaRule(input.software, input.minecraftVersion);
    const fallbackMajor = proxyRule?.minimum ?? minimumJavaMajorForMinecraft(input.minecraftVersion);
    const providerMetadataMajor = providerMetadata?.major ?? null;
    const minimumMajor = jarMajor ?? providerMetadataMajor ?? fallbackMajor;
    const requiredMajor = minimumMajor ?? 21;
    const confidence = jarMajor
      ? detection?.status === "confirmed" ? "jar" : "fallback"
      : providerMetadataMajor
        ? "metadata"
        : minimumMajor
          ? "rules"
          : "unknown";
    const recommendedMajor = proxyRule?.recommended ?? providerMetadataMajor ?? minimumMajor ?? 21;
    const source = jarMajor
      ? detection?.method === "class-file" || detection?.method === "nested-class-file" ? "jar-class-files" : "jar-metadata"
      : providerMetadata
        ? "online-provider-metadata"
        : proxyRule
          ? "official-guidance"
          : "fallback-rules";
    const sourceUrl = detection?.method === "class-file" || detection?.method === "nested-class-file" || detection?.method === "manifest" || detection?.method === "bootstrap-metadata"
      ? null
      : providerMetadata?.sourceUrl ?? proxyRule?.sourceUrl ?? "https://docs.papermc.io/paper/getting-started/";
    const installedRuntimes = await javaRuntimeRegistry.listRuntimes();
    const compatibleRuntime =
      installedRuntimes
        .filter((runtime) => runtime.status === "valid" && runtime.major >= requiredMajor && (!proxyRule?.maximum || runtime.major <= proxyRule.maximum))
        .sort((a, b) => a.major - b.major || Number(a.source === "system") - Number(b.source === "system"))[0] ??
      null;
    const warnings: string[] = [...(detection?.warnings ?? [])];
    // A fallback is provisional only when there was no artifact to inspect.
    // Once a JAR was supplied, an unreadable or ambiguous inspection must stay
    // visible as such so startup and creation cannot silently guess.
    const status = detection ? detection.status : "provisional";

    if (!minimumMajor) {
      warnings.push("Java compatibility is unknown for this version.");
    } else if (compatibleRuntime && compatibleRuntime.major > recommendedMajor) {
      warnings.push(`Java ${compatibleRuntime.major} is newer than the recommended Java ${recommendedMajor}, but meets the minimum requirement.`);
    }

    if (detection?.status === "ambiguous" || detection?.status === "unavailable") {
      warnings.push("The JAR requirement could not be confirmed; the displayed version is provisional and needs a rescan or explicit advanced confirmation.");
    }

    if (input.serverId && detection) {
      await prisma.server.update({
        where: { id: input.serverId },
        data: {
          javaRequirementMajor: detection.requiredMajor,
          javaRequirementConfidence: detection.confidence,
          javaRequirementMethod: detection.method,
          javaRequirementDetails: JSON.stringify({
            minimumMajor: detection.minimumMajor,
            maximumMajor: detection.maximumMajor,
            status: detection.status,
            artifactSha256: detection.artifactSha256,
            artifactSizeBytes: detection.artifactSizeBytes,
            artifactCheckedAt: detection.artifactCheckedAt,
            indicators: detection.indicators,
            warnings: detection.warnings,
          }),
          javaRequirementDetectedAt: new Date(),
        },
      }).catch(() => {});
    }

    return {
      minecraftVersion: input.minecraftVersion,
      software: input.software as ServerSoftware,
      requiredMajor,
      minimumMajor: requiredMajor,
      maximumMajor: proxyRule?.maximum ?? null,
      recommendedMajor,
      confidence,
      status,
      detection,
      source,
      sourceUrl,
      checkedAt: new Date().toISOString(),
      artifactSha256: detection?.artifactSha256 ?? null,
      artifactSizeBytes: detection?.artifactSizeBytes ?? null,
      artifactCheckedAt: detection?.artifactCheckedAt ?? null,
      compatibleRuntime,
      autoSelectedRuntime: Boolean(compatibleRuntime),
      runtimeSelectionReason: compatibleRuntime
        ? `Lowest valid runtime meeting Java ${requiredMajor}`
        : `No valid managed runtime meets Java ${requiredMajor}`,
      installedRuntimes,
      missing: !compatibleRuntime || status === "ambiguous" || status === "unavailable",
      warnings,
    };
  }

  isCompatible(
    runtimeMajor: number,
    requiredMajor: number,
    allowUnsupported: boolean,
    _software?: string,
    maximumMajor?: number | null
  ): boolean {
    if (runtimeMajor < requiredMajor) return false;
    if (maximumMajor && runtimeMajor > maximumMajor && !allowUnsupported) return false;
    return true;
  }

  private async tryProviderMetadata(
    minecraftVersion: string,
    software: ServerSoftware | string
  ): Promise<{ major: number; sourceUrl: string } | null> {
    if (software !== "paper" && software !== "folia") return null;
    try {
      const response = await fetch(
        `https://fill.papermc.io/v3/projects/${software}/versions/${encodeURIComponent(minecraftVersion)}`,
        { headers: { Accept: "application/json", "User-Agent": APP_USER_AGENT } }
      );
      if (!response.ok) return null;
      const data = (await response.json()) as PaperVersionMetadata;
      const rawMajor = data.version?.java?.version?.minimum;
      const major = parseJavaMajor(rawMajor);
      return major ? { major, sourceUrl: `https://fill.papermc.io/v3/projects/${software}/versions/${encodeURIComponent(minecraftVersion)}` } : null;
    } catch {
      return null;
    }
  }

}

function parseJavaMajor(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 8) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/(?:^|\D)(1\.)?(\d{1,3})(?:\D|$)/);
  const major = match ? Number(match[2]) : NaN;
  return Number.isInteger(major) && major >= 8 ? major : null;
}

function proxyJavaRule(
  software: string,
  _version: string
): { minimum: number; recommended: number; maximum?: number; sourceUrl: string } | null {
  switch (software) {
    case "velocity":
      return { minimum: 21, recommended: 25, sourceUrl: "https://docs.papermc.io/velocity/faq/" };
    case "waterfall":
      return { minimum: 8, recommended: 11, sourceUrl: "https://docs.papermc.io/waterfall/getting-started/" };
    case "bungeecord":
      return { minimum: 17, recommended: 17, sourceUrl: "https://github.com/SpigotMC/BungeeCord" };
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
