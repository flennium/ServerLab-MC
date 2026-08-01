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

export function toJavaRuntime(record: RuntimeRecord): JavaRuntime | null {
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
    detectedAt: record.detectedAt,
    installedAt: record.installedAt,
    lastValidatedAt: record.lastValidatedAt,
    lastUsedAt: record.lastUsedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
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
    return records.map((record) => toJavaRuntime(record)).filter(Boolean) as JavaRuntime[];
  }

  async getRuntime(id: string): Promise<JavaRuntime | null> {
    const record = await prisma.javaRuntime.findUnique({ where: { id } });
    return toJavaRuntime(record);
  }

  async getBestRuntime(major: number): Promise<JavaRuntime | null> {
    const records = await prisma.javaRuntime.findMany({
      where: { major: { gte: major }, status: "valid" },
      orderBy: [{ major: "asc" }, { source: "asc" }],
    });
    return toJavaRuntime(records[0] ?? null);
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
    const executablePath = input.executablePath === "java" ? "java" : path.resolve(input.executablePath);
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
        installedAt: input.source === "managed" ? new Date() : undefined,
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

    await prisma.javaVersion.upsert({
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
    }).catch(() => {});

    await this.writeMetadataMirror();
    return toJavaRuntime(record)!;
  }

  async markStatus(id: string, status: JavaRuntimeStatus): Promise<JavaRuntime | null> {
    const record = await prisma.javaRuntime.update({
      where: { id },
      data: { status, lastValidatedAt: new Date() },
    }).catch(() => null);
    await this.writeMetadataMirror();
    return toJavaRuntime(record);
  }

  async touchUsed(id: string): Promise<void> {
    await prisma.javaRuntime.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});
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
    await this.writeMetadataMirror();
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
