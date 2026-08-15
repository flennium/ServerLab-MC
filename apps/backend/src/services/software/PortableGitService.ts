import crypto from "crypto";
import { execFile } from "child_process";
import extractZip from "extract-zip";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { APP_USER_AGENT } from "@serverlab/shared";

const execFileAsync = promisify(execFile);
const GITHUB_RELEASES_URL = "https://api.github.com/repos/git-for-windows/git/releases/latest";
const ALLOWED_HOSTS = [
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
];

interface GitAsset {
  name?: string;
  browser_download_url?: string;
  digest?: string | null;
}

interface GitRelease {
  tag_name?: string;
  assets?: GitAsset[];
}

interface CachedGitMetadata {
  version: string;
  assetName: string;
  archiveSha256: string;
  downloadedAt: string;
}

export interface PortableGitEnvironment {
  source: "bundled" | "system";
  gitPath: string;
  pathEntries: string[];
  version: string | null;
}

export interface PortableGitProgress {
  bytesReceived: number;
  totalBytes: number | null;
  percent: number | null;
}

function rootPath(): string {
  return path.join(process.env.DATA_DIR ?? process.cwd(), "tools", "git");
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function allowedUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.includes(url.hostname)) {
    throw new Error(`Portable Git download host is not allowed: ${url.hostname}`);
  }
  return url;
}

export class PortableGitService {
  readonly root = rootPath();

  async findSystemGit(): Promise<PortableGitEnvironment | null> {
    try {
      const { stdout } = await execFileAsync("git", ["--version"], { windowsHide: true });
      return {
        source: "system",
        gitPath: "git",
        pathEntries: [],
        version: stdout.trim() || null,
      };
    } catch {
      return null;
    }
  }

  async getCached(): Promise<PortableGitEnvironment | null> {
    if (process.platform !== "win32") return null;
    const entries = await fs.readdir(this.root).catch(() => []);
    for (const entry of entries.sort().reverse()) {
      const directory = path.join(this.root, entry);
      const metadata = JSON.parse(
        await fs.readFile(path.join(directory, "metadata.json"), "utf8").catch(() => "null")
      ) as CachedGitMetadata | null;
      if (!metadata) continue;
      const archivePath = path.join(directory, metadata.assetName);
      const gitPath = path.join(directory, "cmd", "git.exe");
      const archive = await fs.stat(archivePath).catch(() => null);
      const executable = await fs.stat(gitPath).catch(() => null);
      if (!archive?.isFile() || !executable?.isFile()) continue;
      if ((await this.sha256(archivePath)) !== metadata.archiveSha256) continue;
      return {
        source: "bundled",
        gitPath,
        pathEntries: [
          path.join(directory, "cmd"),
          path.join(directory, "mingw64", "bin"),
          path.join(directory, "usr", "bin"),
        ],
        version: metadata.version,
      };
    }
    return null;
  }

  async ensure(onProgress?: (progress: PortableGitProgress) => Promise<void>): Promise<PortableGitEnvironment> {
    const cached = await this.getCached();
    if (cached) return cached;
    if (process.platform !== "win32") {
      const system = await this.findSystemGit();
      if (!system) throw new Error("Git is required to build Spigot on this platform");
      return system;
    }

    const release = await this.resolveLatest();
    const versionDirectory = path.join(this.root, safeName(release.version));
    const archivePath = path.join(versionDirectory, release.assetName);
    const partialPath = `${archivePath}.part`;
    const extractionPath = `${versionDirectory}.tmp-${process.pid}`;
    await fs.rm(extractionPath, { recursive: true, force: true });
    await fs.mkdir(versionDirectory, { recursive: true });
    const bytes = await this.download(release.downloadUrl, partialPath, onProgress);
    const archiveSha256 = await this.sha256(partialPath);
    if (release.digest && !release.digest.endsWith(archiveSha256)) {
      throw new Error("Portable Git checksum does not match the release metadata");
    }
    await fs.rename(partialPath, archivePath);
    await extractZip(archivePath, { dir: extractionPath });
    const extractedGit = path.join(extractionPath, "cmd", "git.exe");
    const extractedStat = await fs.stat(extractedGit).catch(() => null);
    if (!extractedStat?.isFile()) throw new Error("Portable Git archive did not contain cmd/git.exe");
    await fs.rename(archivePath, path.join(extractionPath, release.assetName));
    await fs.rm(versionDirectory, { recursive: true, force: true });
    await fs.rename(extractionPath, versionDirectory);
    await fs.writeFile(path.join(versionDirectory, "metadata.json"), JSON.stringify({
      version: release.version,
      assetName: release.assetName,
      archiveSha256,
      downloadedAt: new Date().toISOString(),
    } satisfies CachedGitMetadata, null, 2), "utf8");
    void bytes;
    return (await this.getCached())!;
  }

  async refresh(): Promise<void> {
    await fs.rm(this.root, { recursive: true, force: true });
  }

  private async resolveLatest(): Promise<{ version: string; assetName: string; downloadUrl: string; digest: string | null }> {
    allowedUrl(GITHUB_RELEASES_URL);
    const response = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": APP_USER_AGENT },
    });
    if (!response.ok) throw new Error(`Portable Git metadata request failed (${response.status})`);
    const release = (await response.json()) as GitRelease;
    const asset = (release.assets ?? []).find((entry) => /^MinGit-.*-64-bit\.zip$/i.test(entry.name ?? ""));
    if (!asset?.name || !asset.browser_download_url) throw new Error("The latest portable Git release has no x64 MinGit archive");
    allowedUrl(asset.browser_download_url);
    return {
      version: release.tag_name ?? asset.name,
      assetName: asset.name,
      downloadUrl: asset.browser_download_url,
      digest: asset.digest?.replace(/^sha256:/i, "") ?? null,
    };
  }

  private async download(url: string, targetPath: string, onProgress?: (progress: PortableGitProgress) => Promise<void>): Promise<number> {
    let current = allowedUrl(url).toString();
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(current, {
        redirect: "manual",
        headers: { Accept: "application/zip", "User-Agent": APP_USER_AGENT },
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("Portable Git download redirect did not include a location");
      current = allowedUrl(new URL(location, current).toString()).toString();
    }
    if (!response?.ok || !response.body) throw new Error(`Portable Git download failed (${response?.status ?? "no response"})`);
    const total = Number(response.headers.get("content-length")) || null;
    const output = await fs.open(targetPath, "w");
    const reader = response.body.getReader();
    let bytes = 0;
    try {
      for (let next = await reader.read(); !next.done; next = await reader.read()) {
        await output.write(next.value);
        bytes += next.value.byteLength;
        await onProgress?.({
          bytesReceived: bytes,
          totalBytes: total,
          percent: total ? (bytes / total) * 100 : null,
        });
      }
    } finally {
      await output.close();
    }
    return bytes;
  }

  private async sha256(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    hash.update(await fs.readFile(filePath));
    return hash.digest("hex");
  }
}

export const portableGitService = new PortableGitService();
