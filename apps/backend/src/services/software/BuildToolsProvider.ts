import { APP_USER_AGENT } from "@serverlab/shared";
import { assertAllowedHttpsUrl } from "./providers.js";

const BUILD_TOOLS_HOSTS = ["hub.spigotmc.org"];
const BUILD_TOOLS_URL =
  "https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar";
const BUILD_TOOLS_API =
  "https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/api/json";

export interface BuildToolsRelease {
  buildNumber: string;
  version: string;
  downloadUrl: string;
  metadataUrl: string;
}

export class BuildToolsProvider {
  readonly allowedHosts = BUILD_TOOLS_HOSTS;

  async resolveLatest(): Promise<BuildToolsRelease> {
    assertAllowedHttpsUrl(BUILD_TOOLS_API, this.allowedHosts);
    const response = await fetch(BUILD_TOOLS_API, {
      headers: { Accept: "application/json", "User-Agent": APP_USER_AGENT },
    });
    if (!response.ok) throw new Error(`BuildTools metadata request failed (${response.status})`);
    const data = (await response.json()) as { number?: number; id?: string };
    const buildNumber = String(data.number ?? data.id ?? "latest");
    return {
      buildNumber,
      version: data.id ?? buildNumber,
      downloadUrl: BUILD_TOOLS_URL,
      metadataUrl: BUILD_TOOLS_API,
    };
  }

  validateDownloadUrl(url: string): URL {
    return assertAllowedHttpsUrl(url, this.allowedHosts);
  }
}

export const buildToolsProvider = new BuildToolsProvider();
