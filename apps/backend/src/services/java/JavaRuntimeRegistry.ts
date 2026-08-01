import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { prisma } from "../../lib/prisma.js";
import type {
  JavaRuntime,
  JavaRuntimeProviderId,
  JavaRuntimeSource,
  JavaRuntimeStatus,
} from "@serverlab/shared";
import { javaRuntimePaths } from "./JavaRuntimePaths.js";

type RuntimeRecord = Awaited<ReturnType<typeof prisma.javaRuntime.findFirst>>;

interface JavaCacheMetadata {
  version: string;
  vendor: string;
  architecture: string;
  installedAt: string;
  lastUsed: string;
  path: string;
}

export function toJavaRuntime(
  record: RuntimeRecord,
  sizeBytes: number | null = null
): JavaRuntime | null {
  if (!record) return null;
  return {
    id: record.id,
    provider: record.provider as JavaRuntimeProviderId | null,
    distribution: record.distribution,
    major: record.major,
    version: record.version,
    os: record.os,
    arch: record.arch,
    source: record.source as JavaRuntimeSource,
    path: record.path,
    executablePath: record.executablePath,
    status: record.status as JavaRuntimeStatus,
    checksum: record.checksum,
    sizeBytes,
    detectedAt: record.detectedAt,
    installedAt: record.installedAt,
    lastValidatedAt: record.lastValidatedAt,
    lastUsedAt: record.lastUsedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function directorySize(root: string): Promise<number | null> {
  let total = 0;
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => null);
    if (!entries) return null;
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath).catch(() => null);
        if (stat) total += stat.size;
      }
    }
  }
  return total;
}

export class JavaRuntimeRegistry {
  async ensureDirectories(): Promise<void> {
    await Promise.all([
      fs.mkdir(javaRuntimePaths.managedRoot, { recursive: true }),
      fs.mkdir(javaRuntimePaths.downloadsRoot, { recursive: true }),
      fs.mkdir(javaRuntimePaths.tmpRoot, { recursive: true }),
      fs.mkdir(javaRuntimePaths.logsRoot, { recursive: true }),
    ]);
  }

  async listRuntimes(): Promise<JavaRuntime[]> {
    const records = await prisma.javaRuntime.findMany({
      orderBy: [{ source: "asc" }, { major: "asc" }, { distribution: "asc" }],
    });
    await this.reconcileManagedCache(records);
    const refreshed = await prisma.javaRuntime.findMany({
      orderBy: [{ source: "asc" }, { major: "asc" }, { distribution: "asc" }],
    });
    const runtimes = (
      await Promise.all(refreshed.map((record) => this.toRuntimeWithCache(record)))
    ).filter(Boolean) as JavaRuntime[];
    await Promise.all(
      runtimes
        .filter((runtime) => runtime.source === "managed")
        .map((runtime) => this.writeRuntimeMetadata(runtime))
    );
    return runtimes;
  }

  async getRuntime(id: string): Promise<JavaRuntime | null> {
    const record = await prisma.javaRuntime.findUnique({ where: { id } });
    return this.toRuntimeWithCache(record);
  }

  async getBestRuntime(major: number): Promise<JavaRuntime | null> {
    const records = await prisma.javaRuntime.findMany({
      where: { major: { gte: major }, status: "valid" },
      orderBy: [{ major: "asc" }, { source: "asc" }],
    });
    return this.toRuntimeWithCache(records[0] ?? null);
  }

  async findReusableManagedRuntime(input: {
    major: number;
    provider?: JavaRuntimeProviderId;
    os?: string;
    arch?: string;
  }): Promise<JavaRuntime | null> {
    const records = await prisma.javaRuntime.findMany({
      where: {
        source: "managed",
        major: input.major,
        status: "valid",
        provider: input.provider,
        os: input.os,
        arch: input.arch,
      },
      orderBy: [{ lastUsedAt: "desc" }, { installedAt: "desc" }],
    });
    return this.toRuntimeWithCache(records[0] ?? null);
  }

  async upsertRuntime(input: {
    provider?: JavaRuntimeProviderId | null;
    distribution: string;
    major: number;
    version: string;
    os: string;
    arch: string;
    source: JavaRuntimeSource;
    path: string;
    executablePath: string;
    status: JavaRuntimeStatus;
    checksum?: string | null;
  }): Promise<JavaRuntime> {
    const executablePath =
      input.executablePath === "java" ? "java" : path.resolve(input.executablePath);
    const runtimePath = input.path === "PATH" ? "PATH" : path.resolve(input.path);
    const record = await prisma.javaRuntime.upsert({
      where: { executablePath },
      update: {
        provider: input.provider ?? null,
        distribution: input.distribution,
        major: input.major,
        version: input.version,
        os: input.os,
        arch: input.arch,
        source: input.source,
        path: runtimePath,
        status: input.status,
        checksum: input.checksum ?? null,
        detectedAt: input.source === "system" ? new Date() : undefined,
        lastValidatedAt: new Date(),
      },
      create: {
        id: crypto.randomUUID(),
        provider: input.provider ?? null,
        distribution: input.distribution,
        major: input.major,
        version: input.version,
        os: input.os,
        arch: input.arch,
        source: input.source,
        path: runtimePath,
        executablePath,
        status: input.status,
        checksum: input.checksum ?? null,
        detectedAt: input.source === "system" ? new Date() : null,
        installedAt: input.source === "managed" ? new Date() : null,
        lastValidatedAt: new Date(),
      },
    });

    await prisma.javaVersion
      .upsert({
        where: { id: executablePath },
        create: {
          id: executablePath,
          major: input.major,
          path: executablePath,
          vendor: input.distribution,
          detected: input.source !== "manual",
        },
        update: {
          major: input.major,
          path: executablePath,
          vendor: input.distribution,
          detected: input.source !== "manual",
        },
      })
      .catch(() => {});

    const runtime = (await this.toRuntimeWithCache(record))!;
    if (runtime.source === "managed") await this.writeRuntimeMetadata(runtime);
    await this.writeMetadataMirror();
    return runtime;
  }

  async markStatus(id: string, status: JavaRuntimeStatus): Promise<JavaRuntime | null> {
    const record = await prisma.javaRuntime
      .update({
        where: { id },
        data: { status, lastValidatedAt: new Date() },
      })
      .catch(() => null);
    const runtime = await this.toRuntimeWithCache(record);
    if (runtime?.source === "managed") await this.writeRuntimeMetadata(runtime);
    await this.writeMetadataMirror();
    return runtime;
  }

  async touchUsed(id: string): Promise<void> {
    const record = await prisma.javaRuntime
      .update({
        where: { id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});
    const runtime = await this.toRuntimeWithCache(record);
    if (runtime?.source === "managed") await this.writeRuntimeMetadata(runtime);
    await this.writeMetadataMirror();
  }

  async removeRuntime(id: string): Promise<void> {
    const runtime = await prisma.javaRuntime.findUnique({
      where: { id },
      include: { servers: true },
    });
    if (!runtime) return;
    if (runtime.servers.length > 0) {
      throw new Error("This Java runtime is still assigned to one or more servers");
    }
    if (runtime.source === "managed") {
      await fs.rm(runtime.path, { recursive: true, force: true }).catch(() => {});
    }
    await prisma.javaRuntime.delete({ where: { id } });
    await prisma.javaVersion
      .delete({ where: { id: runtime.executablePath } })
      .catch(() => {});
    await this.writeMetadataMirror();
  }

  private async toRuntimeWithCache(record: RuntimeRecord): Promise<JavaRuntime | null> {
    if (!record) return null;
    const sizeBytes =
      record.source === "managed"
        ? await directorySize(record.path).catch(() => null)
        : null;
    return toJavaRuntime(record, sizeBytes);
  }

  private async reconcileManagedCache(
    records: NonNullable<RuntimeRecord>[]
  ): Promise<void> {
    await Promise.all(
      records
        .filter((runtime) => runtime.source === "managed")
        .map(async (runtime) => {
          const executable = await fs.stat(runtime.executablePath).catch(() => null);
          if (!executable?.isFile() && runtime.status !== "missing") {
            await prisma.javaRuntime
              .update({
                where: { id: runtime.id },
                data: { status: "missing", lastValidatedAt: new Date() },
              })
              .catch(() => {});
          }
        })
    );
  }

  private cacheMetadata(runtime: JavaRuntime): JavaCacheMetadata {
    return {
      version: String(runtime.major),
      vendor: runtime.distribution,
      architecture: runtime.arch,
      installedAt: runtime.installedAt ? new Date(runtime.installedAt).toISOString() : "",
      lastUsed: runtime.lastUsedAt ? new Date(runtime.lastUsedAt).toISOString() : "",
      path: runtime.path,
    };
  }

  private async writeRuntimeMetadata(runtime: JavaRuntime): Promise<void> {
    await fs
      .writeFile(
        path.join(runtime.path, "serverlab-java-runtime.json"),
        JSON.stringify(this.cacheMetadata(runtime), null, 2),
        "utf8"
      )
      .catch(() => {});
  }

  private async writeMetadataMirror(): Promise<void> {
    await this.ensureDirectories();
    const runtimes = await this.listRuntimes();
    await fs
      .writeFile(
        javaRuntimePaths.metadataPath,
        JSON.stringify({ updatedAt: new Date().toISOString(), runtimes }, null, 2),
        "utf8"
      )
      .catch(() => {});
  }
}

export const javaRuntimeRegistry = new JavaRuntimeRegistry();
