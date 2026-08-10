import fs from "fs";
import fsp from "fs/promises";
import https from "https";
import type { ClientRequest } from "http";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import extractZip from "extract-zip";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { errorService } from "../ErrorService.js";
import { getSoftwareSocketServer } from "../software/softwareEvents.js";
import {
  APP_USER_AGENT,
  type JavaInstallJob,
  type JavaInstallProgressPayload,
  type JavaInstallStage,
  type JavaPackageType,
  type JavaRuntime,
  type JavaRuntimeProviderId,
} from "@serverlab/shared";
import { javaRuntimePaths } from "./JavaRuntimePaths.js";
import {
  javaRuntimeProviderRegistry,
  assertAllowedJavaUrl,
} from "./JavaRuntimeProviders.js";
import { javaRuntimeRegistry } from "./JavaRuntimeRegistry.js";
import { javaRuntimeValidator } from "./JavaRuntimeValidator.js";
import type { ResolvedJavaRuntime } from "./types.js";

interface ActiveInstall {
  request: ClientRequest;
  tmpPath: string;
  cancelled: boolean;
}

function toInstall(
  record: Awaited<ReturnType<typeof prisma.javaInstallJob.findUnique>>
): JavaInstallJob {
  if (!record) throw new Error("Java install job not found");
  return {
    id: record.id,
    provider: record.provider as JavaRuntimeProviderId,
    major: record.major,
    version: record.version,
    status: record.status as JavaInstallJob["status"],
    stage: record.stage as JavaInstallStage,
    bytesReceived: record.bytesReceived,
    totalBytes: record.totalBytes,
    speedBytesPerSec: record.speedBytesPerSec,
    etaSeconds: record.etaSeconds,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class JavaInstallService {
  private readonly active = new Map<string, ActiveInstall>();

  async install(input: {
    major: number;
    provider?: JavaRuntimeProviderId;
    packageType?: JavaPackageType;
    requestId?: string;
  }): Promise<{ install: JavaInstallJob; runtime: JavaRuntime }> {
    await javaRuntimeRegistry.ensureDirectories();
    const installId = input.requestId ?? crypto.randomUUID();
    const providerId = input.provider ?? "adoptium";
    const queued = await prisma.javaInstallJob.upsert({
      where: { id: installId },
      update: {
        provider: providerId,
        major: input.major,
        version: null,
        status: "queued",
        stage: "resolving-provider",
        bytesReceived: 0,
        totalBytes: null,
        speedBytesPerSec: 0,
        etaSeconds: null,
        error: null,
      },
      create: {
        id: installId,
        provider: providerId,
        major: input.major,
        status: "queued",
        stage: "resolving-provider",
      },
    });
    this.emit(toInstall(queued), 0);

    let runtimeMeta: ResolvedJavaRuntime | null = null;
    const tmpPath = path.join(javaRuntimePaths.tmpRoot, `${installId}.part`);

    try {
      const cached = await this.reuseCachedRuntime(installId, input.major, providerId);
      if (cached) return cached;

      await this.updateInstall(installId, {
        status: "running",
        stage: "resolving-provider",
      });
      runtimeMeta = await javaRuntimeProviderRegistry.resolveWithFallback({
        provider: input.provider,
        major: input.major,
        packageType: input.packageType ?? "jre",
      });
      await this.updateInstall(installId, {
        provider: runtimeMeta.provider,
        version: runtimeMeta.version,
        stage: "downloading",
      });

      const provider = javaRuntimeProviderRegistry.get(runtimeMeta.provider);
      const sizeBytes = await this.downloadToTmp(
        installId,
        runtimeMeta,
        tmpPath,
        provider.allowedHosts
      );

      const verifying = await this.updateInstall(installId, {
        stage: "verifying",
        bytesReceived: sizeBytes,
        totalBytes: runtimeMeta.sizeBytes ?? sizeBytes,
        etaSeconds: 0,
      });
      this.emit(verifying, 96);
      await this.verifyChecksum(tmpPath, runtimeMeta);

      const extracting = await this.updateInstall(installId, { stage: "extracting" });
      this.emit(extracting, 97);
      const installRoot = this.installRoot(runtimeMeta);
      await fsp.rm(installRoot, { recursive: true, force: true }).catch(() => {});
      await fsp.mkdir(installRoot, { recursive: true });
      await this.extractArchive(tmpPath, installRoot, runtimeMeta.archiveType);

      const validating = await this.updateInstall(installId, { stage: "validating" });
      this.emit(validating, 98);
      const executablePath = await javaRuntimeValidator.findExecutable(installRoot);
      const versionInfo = await javaRuntimeValidator.validateExecutable(executablePath);

      const registering = await this.updateInstall(installId, { stage: "registering" });
      this.emit(registering, 99);
      const runtime = await javaRuntimeRegistry.upsertRuntime({
        provider: runtimeMeta.provider,
        distribution: runtimeMeta.distribution,
        major: versionInfo.major,
        version: versionInfo.version || runtimeMeta.version,
        os: runtimeMeta.os,
        arch: runtimeMeta.arch,
        source: "managed",
        path: installRoot,
        executablePath,
        status: versionInfo.major === input.major ? "valid" : "unsupported",
        checksum: runtimeMeta.checksum,
      });

      const done = await this.updateInstall(installId, {
        status: "completed",
        stage: "done",
        bytesReceived: sizeBytes,
        totalBytes: sizeBytes,
        speedBytesPerSec: 0,
        etaSeconds: 0,
      });
      this.emit(done, 100);
      logger.info(
        { installId, runtimeId: runtime.id, provider: runtimeMeta.provider },
        "Java runtime installed"
      );
      return { install: done, runtime };
    } catch (error) {
      const active = this.active.get(installId);
      const cancelled = active?.cancelled === true;
      await fsp.rm(tmpPath, { force: true }).catch(() => {});
      const message = error instanceof Error ? error.message : "Java install failed";
      if (!cancelled) {
        void errorService.record(errorService.createFromUnknown(error, {
          category: "java",
          severity: "error",
          userMessage: "Java runtime installation failed.",
          possibleSolution: "Retry the installation or choose another provider.",
          source: "backend:java-install",
          action: "install-java",
        }));
      }
      const failed = await this.updateInstall(installId, {
        status: cancelled ? "cancelled" : "failed",
        stage: cancelled ? "cancelled" : "failed",
        error: message,
      });
      this.emit(failed, cancelled ? 0 : undefined, message);
      throw error;
    } finally {
      this.active.delete(installId);
      await fsp.rm(tmpPath, { force: true }).catch(() => {});
    }
  }

  async cancel(installId: string): Promise<JavaInstallJob> {
    const active = this.active.get(installId);
    if (active) {
      active.cancelled = true;
      active.request.destroy(new Error("Java install cancelled"));
      await fsp.rm(active.tmpPath, { force: true }).catch(() => {});
    }
    const cancelled = await this.updateInstall(installId, {
      status: "cancelled",
      stage: "cancelled",
      error: "Java install cancelled",
    });
    this.emit(cancelled, 0, "Java install cancelled");
    return cancelled;
  }

  async cleanupTmp(): Promise<void> {
    await javaRuntimeRegistry.ensureDirectories();
    const entries = await fsp.readdir(javaRuntimePaths.tmpRoot).catch(() => []);
    await Promise.all(
      entries.map((entry) =>
        fsp.rm(path.join(javaRuntimePaths.tmpRoot, entry), { force: true })
      )
    );
  }

  private async reuseCachedRuntime(
    installId: string,
    major: number,
    provider: JavaRuntimeProviderId
  ): Promise<{ install: JavaInstallJob; runtime: JavaRuntime } | null> {
    const runtime = await javaRuntimeRegistry.findReusableManagedRuntime({
      major,
      provider,
    });
    if (!runtime) return null;

    const validated = await javaRuntimeValidator.validateRuntime(runtime);
    if (validated.status !== "valid" || validated.major !== major) return null;

    await javaRuntimeRegistry.touchUsed(validated.id);
    const install = await this.updateInstall(installId, {
      provider: validated.provider ?? provider,
      major,
      version: validated.version,
      status: "completed",
      stage: "done",
      bytesReceived: 0,
      totalBytes: 0,
      speedBytesPerSec: 0,
      etaSeconds: 0,
      error: null,
    });
    this.emit(install, 100);
    logger.info({ installId, runtimeId: validated.id }, "Reused cached Java runtime");
    return { install, runtime: validated };
  }

  private installRoot(runtime: ResolvedJavaRuntime): string {
    const safe = (value: string) => value.replace(/[^a-zA-Z0-9._+-]/g, "_");
    return path.join(
      javaRuntimePaths.managedRoot,
      safe(runtime.provider),
      String(runtime.major),
      safe(runtime.version),
      `${safe(runtime.os)}-${safe(runtime.arch)}`
    );
  }

  private downloadToTmp(
    installId: string,
    runtime: ResolvedJavaRuntime,
    tmpPath: string,
    allowedHosts: string[]
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      let bytesReceived = 0;
      let totalBytes = runtime.sizeBytes ?? null;
      const startedAt = Date.now();
      let lastEmitAt = 0;
      const output = fs.createWriteStream(tmpPath);

      const requestUrl = (url: string, redirectsLeft: number): ClientRequest => {
        const parsed = assertAllowedJavaUrl(url, allowedHosts);
        const req = https.get(
          parsed,
          {
            headers: {
              "User-Agent": APP_USER_AGENT,
              Accept: "application/octet-stream,*/*",
            },
          },
          (response) => {
            if (
              response.statusCode &&
              response.statusCode >= 300 &&
              response.statusCode < 400
            ) {
              const location = response.headers.location;
              if (!location || redirectsLeft <= 0) {
                reject(new Error("Runtime provider redirected too many times"));
                return;
              }
              const nextUrl = new URL(location, parsed).toString();
              const nextReq = requestUrl(nextUrl, redirectsLeft - 1);
              this.active.set(installId, { request: nextReq, tmpPath, cancelled: false });
              return;
            }
            if (response.statusCode !== 200) {
              reject(
                new Error(`Java runtime download failed with HTTP ${response.statusCode}`)
              );
              return;
            }

            const contentLength = Number(response.headers["content-length"]);
            if (Number.isFinite(contentLength) && contentLength > 0)
              totalBytes = contentLength;

            response.on("data", (chunk: Buffer) => {
              bytesReceived += chunk.length;
              const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
              const speed = Math.round(bytesReceived / elapsedSeconds);
              const eta =
                totalBytes && speed > 0
                  ? Math.max(0, Math.round((totalBytes - bytesReceived) / speed))
                  : null;
              const percent = totalBytes
                ? Math.min(95, (bytesReceived / totalBytes) * 95)
                : 0;
              const now = Date.now();
              if (now - lastEmitAt > 250) {
                lastEmitAt = now;
                this.updateInstall(installId, {
                  status: "running",
                  stage: "downloading",
                  bytesReceived,
                  totalBytes,
                  speedBytesPerSec: speed,
                  etaSeconds: eta,
                })
                  .then((install) => this.emit(install, percent))
                  .catch((error) =>
                    logger.warn({ error }, "Failed to update Java install progress")
                  );
              }
            });

            response.pipe(output);
          }
        );
        req.on("error", reject);
        return req;
      };

      const request = requestUrl(runtime.downloadUrl, 5);
      this.active.set(installId, { request, tmpPath, cancelled: false });
      output.on("error", reject);
      output.on("finish", () => output.close(() => resolve(bytesReceived)));
    });
  }

  private async verifyChecksum(
    filePath: string,
    runtime: ResolvedJavaRuntime
  ): Promise<void> {
    if (!runtime.checksum) return;
    const buffer = await fsp.readFile(filePath);
    const actual = crypto.createHash("sha256").update(buffer).digest("hex");
    if (actual.toLowerCase() !== runtime.checksum.toLowerCase()) {
      throw new Error(
        "Downloaded Java runtime checksum does not match provider metadata"
      );
    }
  }

  private async extractArchive(
    filePath: string,
    destination: string,
    archiveType: "zip" | "tar.gz"
  ): Promise<void> {
    if (archiveType === "zip") {
      await extractZip(filePath, { dir: destination });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("tar", ["-xzf", filePath, "-C", destination], {
        windowsHide: true,
        stdio: "ignore",
      });
      proc.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("Failed to extract Java archive"))
      );
      proc.on("error", reject);
    });
  }

  private async updateInstall(
    id: string,
    data: Partial<{
      provider: JavaRuntimeProviderId;
      major: number;
      version: string | null;
      status: JavaInstallJob["status"];
      stage: JavaInstallStage;
      bytesReceived: number;
      totalBytes: number | null;
      speedBytesPerSec: number;
      etaSeconds: number | null;
      error: string | null;
    }>
  ): Promise<JavaInstallJob> {
    const record = await prisma.javaInstallJob.update({ where: { id }, data });
    return toInstall(record);
  }

  private emit(install: JavaInstallJob, percent?: number, error?: string): void {
    const resolvedPercent =
      percent ??
      (install.totalBytes && install.totalBytes > 0
        ? Math.min(100, (install.bytesReceived / install.totalBytes) * 100)
        : 0);
    const payload: JavaInstallProgressPayload = {
      installId: install.id,
      provider: install.provider,
      major: install.major,
      version: install.version,
      status: install.status,
      stage: install.stage,
      bytesReceived: install.bytesReceived,
      totalBytes: install.totalBytes,
      percent: resolvedPercent,
      speedBytesPerSec: install.speedBytesPerSec,
      etaSeconds: install.etaSeconds,
      error,
    };
    getSoftwareSocketServer()?.emit("java:install-progress", payload);
  }
}

export const javaInstallService = new JavaInstallService();
