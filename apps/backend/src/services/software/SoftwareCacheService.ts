import fs from "fs/promises";
import path from "path";
import type { SoftwareArtifact, ServerFramework } from "@serverlab/shared";
import { prisma } from "../../lib/prisma.js";

function getSoftwareCacheRoot(): string {
  const dataDir = process.env.DATA_DIR ?? process.cwd();
  return path.join(dataDir, "software-cache");
}

function toArtifact(record: Awaited<ReturnType<typeof prisma.softwareArtifact.findFirst>>): SoftwareArtifact | null {
  if (!record) return null;
  return {
    id: record.id,
    provider: record.provider as ServerFramework,
    minecraftVersion: record.minecraftVersion,
    buildId: record.buildId,
    filename: record.filename,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    cachedPath: record.cachedPath,
    status: record.status as SoftwareArtifact["status"],
    downloadedAt: record.downloadedAt,
    lastUsedAt: record.lastUsedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class SoftwareCacheService {
  readonly root = getSoftwareCacheRoot();
  readonly artifactsRoot = path.join(this.root, "artifacts");
  readonly tmpRoot = path.join(this.root, "tmp");
  readonly metadataPath = path.join(this.root, "metadata.json");

  async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.artifactsRoot, { recursive: true });
    await fs.mkdir(this.tmpRoot, { recursive: true });
  }

  getArtifactPath(provider: ServerFramework, minecraftVersion: string, buildId: string): string {
    const safe = (value: string) => value.replace(/[^a-zA-Z0-9._+-]/g, "_");
    return path.join(
      this.artifactsRoot,
      safe(provider),
      safe(minecraftVersion),
      safe(buildId),
      "server.jar"
    );
  }

  getTmpPath(downloadId: string): string {
    return path.join(this.tmpRoot, `${downloadId.replace(/[^a-zA-Z0-9-]/g, "_")}.part`);
  }

  async listArtifacts(): Promise<SoftwareArtifact[]> {
    const records = await prisma.softwareArtifact.findMany({
      orderBy: [{ provider: "asc" }, { minecraftVersion: "desc" }, { buildId: "desc" }],
    });
    return records.map((record) => toArtifact(record)).filter(Boolean) as SoftwareArtifact[];
  }

  async findValidArtifact(
    provider: ServerFramework,
    minecraftVersion: string,
    buildId: string
  ): Promise<SoftwareArtifact | null> {
    const record = await prisma.softwareArtifact.findUnique({
      where: {
        provider_minecraftVersion_buildId: {
          provider,
          minecraftVersion,
          buildId,
        },
      },
    });
    const artifact = toArtifact(record);
    if (!artifact || artifact.status !== "cached") return null;

    try {
      const stat = await fs.stat(artifact.cachedPath);
      if (!stat.isFile() || stat.size <= 0) {
        await this.markCorrupted(artifact.id);
        return null;
      }
      if (artifact.sizeBytes > 0 && artifact.sizeBytes !== stat.size) {
        await this.markCorrupted(artifact.id);
        return null;
      }
    } catch {
      await this.markCorrupted(artifact.id);
      return null;
    }

    await prisma.softwareArtifact.update({
      where: { id: artifact.id },
      data: { lastUsedAt: new Date() },
    });
    return { ...artifact, lastUsedAt: new Date() };
  }

  async getCachedVersions(provider: ServerFramework): Promise<string[]> {
    const rows = await prisma.softwareArtifact.findMany({
      where: { provider, status: "cached" },
      select: { minecraftVersion: true },
      distinct: ["minecraftVersion"],
      orderBy: { minecraftVersion: "desc" },
    });
    return rows.map((row) => row.minecraftVersion);
  }

  async getCachedBuildIds(provider: ServerFramework, minecraftVersion: string): Promise<Set<string>> {
    const rows = await prisma.softwareArtifact.findMany({
      where: { provider, minecraftVersion, status: "cached" },
      select: { buildId: true },
    });
    return new Set(rows.map((row) => row.buildId));
  }

  async upsertArtifact(input: {
    provider: ServerFramework;
    minecraftVersion: string;
    buildId: string;
    filename: string;
    sizeBytes: number;
    sha256?: string;
    cachedPath: string;
  }): Promise<SoftwareArtifact> {
    const record = await prisma.softwareArtifact.upsert({
      where: {
        provider_minecraftVersion_buildId: {
          provider: input.provider,
          minecraftVersion: input.minecraftVersion,
          buildId: input.buildId,
        },
      },
      update: {
        filename: input.filename,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        cachedPath: input.cachedPath,
        status: "cached",
        downloadedAt: new Date(),
        lastUsedAt: new Date(),
      },
      create: {
        provider: input.provider,
        minecraftVersion: input.minecraftVersion,
        buildId: input.buildId,
        filename: input.filename,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        cachedPath: input.cachedPath,
        status: "cached",
        downloadedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });
    await this.writeMetadataMirror();
    return toArtifact(record)!;
  }

  async markCorrupted(id: string): Promise<void> {
    await prisma.softwareArtifact.update({
      where: { id },
      data: { status: "corrupted" },
    }).catch(() => {});
    await this.writeMetadataMirror();
  }

  async removeArtifact(id: string): Promise<void> {
    const record = await prisma.softwareArtifact.findUnique({ where: { id } });
    if (!record) return;
    await fs.rm(record.cachedPath, { force: true }).catch(() => {});
    await fs.rm(path.dirname(record.cachedPath), { recursive: true, force: true }).catch(() => {});
    await prisma.softwareArtifact.delete({ where: { id } }).catch(() => {});
    await this.writeMetadataMirror();
  }

  async cleanupTmp(): Promise<void> {
    await this.ensureDirectories();
    const entries = await fs.readdir(this.tmpRoot).catch(() => []);
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".part"))
        .map((entry) => fs.rm(path.join(this.tmpRoot, entry), { force: true }))
    );
  }

  private async writeMetadataMirror(): Promise<void> {
    await this.ensureDirectories();
    const artifacts = await this.listArtifacts();
    await fs.writeFile(
      this.metadataPath,
      JSON.stringify({ updatedAt: new Date().toISOString(), artifacts }, null, 2),
      "utf8"
    ).catch(() => {});
  }
}

export const softwareCacheService = new SoftwareCacheService();
