import fs from "fs";
import fsp from "fs/promises";
import https from "https";
import type { ClientRequest } from "http";
import path from "path";
import crypto from "crypto";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { errorService } from "../ErrorService.js";
import { softwareCacheService } from "./SoftwareCacheService.js";
import { assertAllowedHttpsUrl, softwareProviderRegistry } from "./providers.js";
import { getSoftwareSocketServer } from "./softwareEvents.js";
import {
  APP_USER_AGENT,
  type ServerFramework,
  type SoftwareArtifact,
  type SoftwareDownload,
  type SoftwareDownloadProgressPayload,
  type SoftwareInstallStage,
} from "@serverlab/shared";
import type { SoftwareArtifactMeta } from "./types.js";

interface EnsureArtifactRequest {
  provider: ServerFramework;
  minecraftVersion: string;
  buildId: string;
  requestId?: string;
}

interface ActiveDownload {
  request: ClientRequest;
  tmpPath: string;
  cancelled: boolean;
}

function toDownload(record: Awaited<ReturnType<typeof prisma.softwareDownload.findUnique>>): SoftwareDownload {
  if (!record) throw new Error("Download record not found");
  return {
    id: record.id,
    provider: record.provider as ServerFramework,
    minecraftVersion: record.minecraftVersion,
    buildId: record.buildId,
    status: record.status as SoftwareDownload["status"],
    bytesReceived: record.bytesReceived,
    totalBytes: record.totalBytes,
    speedBytesPerSec: record.speedBytesPerSec,
    etaSeconds: record.etaSeconds,
    stage: record.stage as SoftwareInstallStage,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class SoftwareDownloadService {
  private readonly active = new Map<string, ActiveDownload>();

  async ensureArtifact(input: EnsureArtifactRequest): Promise<{
    download: SoftwareDownload;
    artifact: SoftwareArtifact;
    cached: boolean;
  }> {
    await softwareCacheService.ensureDirectories();
    const downloadId = input.requestId ?? crypto.randomUUID();
    const provider = softwareProviderRegistry.get(input.provider);

    const queued = await prisma.softwareDownload.upsert({
      where: { id: downloadId },
      update: {
        provider: input.provider,
        minecraftVersion: input.minecraftVersion,
        buildId: input.buildId,
        status: "queued",
        bytesReceived: 0,
        totalBytes: null,
        speedBytesPerSec: 0,
        etaSeconds: null,
        stage: "resolving-provider",
        error: null,
      },
      create: {
        id: downloadId,
        provider: input.provider,
        minecraftVersion: input.minecraftVersion,
        buildId: input.buildId,
        status: "queued",
        stage: "resolving-provider",
      },
    });

    this.emit(toDownload(queued), 0);

    await this.updateDownload(downloadId, {
      status: "running",
      stage: "checking-cache",
    });

    const cached = await softwareCacheService.findValidArtifact(
      input.provider,
      input.minecraftVersion,
      input.buildId
    );
    if (cached) {
      const done = await this.updateDownload(downloadId, {
        status: "cached",
        stage: "done",
        bytesReceived: cached.sizeBytes,
        totalBytes: cached.sizeBytes,
        speedBytesPerSec: 0,
        etaSeconds: 0,
      });
      this.emit(done, 100);
      return { download: done, artifact: cached, cached: true };
    }

    const artifactMeta = await provider.resolveArtifact({
      minecraftVersion: input.minecraftVersion,
      buildId: input.buildId,
    });
    assertAllowedHttpsUrl(artifactMeta.downloadUrl, provider.allowedHosts);

    await this.updateDownload(downloadId, { stage: "downloading" });
    const tmpPath = softwareCacheService.getTmpPath(downloadId);
    const finalPath = softwareCacheService.getArtifactPath(
      input.provider,
      input.minecraftVersion,
      input.buildId
    );

    try {
      const sizeBytes = await this.downloadToTmp(downloadId, artifactMeta, tmpPath, provider.allowedHosts);
      const verifying = await this.updateDownload(downloadId, {
        stage: "verifying",
        bytesReceived: sizeBytes,
        totalBytes: artifactMeta.expectedSizeBytes ?? sizeBytes,
        etaSeconds: 0,
      });
      this.emit(verifying, 99);

      await provider.validateArtifact(tmpPath, artifactMeta);
      await fsp.mkdir(path.dirname(finalPath), { recursive: true });
      await fsp.rename(tmpPath, finalPath);

      const artifact = await softwareCacheService.upsertArtifact({
        provider: input.provider,
        minecraftVersion: input.minecraftVersion,
        buildId: input.buildId,
        filename: artifactMeta.filename,
        sizeBytes,
        sha256: artifactMeta.sha256,
        cachedPath: finalPath,
      });
      const completed = await this.updateDownload(downloadId, {
        status: "completed",
        stage: "done",
        bytesReceived: sizeBytes,
        totalBytes: sizeBytes,
        speedBytesPerSec: 0,
        etaSeconds: 0,
      });
      this.emit(completed, 100);
      logger.info(
        {
          provider: input.provider,
          version: input.minecraftVersion,
          build: input.buildId,
          url: artifactMeta.downloadUrl,
          sha256: artifactMeta.sha256,
          sizeBytes,
        },
        "Software artifact downloaded"
      );
      return { download: completed, artifact, cached: false };
    } catch (error) {
      await fsp.rm(tmpPath, { force: true }).catch(() => {});
      const message = error instanceof Error ? error.message : "Download failed";
      if (!this.active.get(downloadId)?.cancelled) {
        void errorService.record(errorService.createFromUnknown(error, {
          category: "download",
          severity: "error",
          userMessage: "Server software download failed.",
          possibleSolution: "Retry the download or use a cached artifact.",
          source: "backend:software-download",
          action: "download-server-software",
        }));
      }
      const failed = await this.updateDownload(downloadId, {
        status: this.active.get(downloadId)?.cancelled ? "cancelled" : "failed",
        stage: this.active.get(downloadId)?.cancelled ? "cancelled" : "failed",
        error: message,
      });
      this.emit(failed, failed.status === "cancelled" ? 0 : undefined, message);
      throw error;
    } finally {
      this.active.delete(downloadId);
    }
  }

  async cancel(downloadId: string): Promise<SoftwareDownload> {
    const active = this.active.get(downloadId);
    if (active) {
      active.cancelled = true;
      active.request.destroy(new Error("Download cancelled"));
      await fsp.rm(active.tmpPath, { force: true }).catch(() => {});
    }

    const cancelled = await this.updateDownload(downloadId, {
      status: "cancelled",
      stage: "cancelled",
      error: "Download cancelled",
    });
    this.emit(cancelled, 0, "Download cancelled");
    return cancelled;
  }

  async getDownload(id: string): Promise<SoftwareDownload | null> {
    const record = await prisma.softwareDownload.findUnique({ where: { id } });
    return record ? toDownload(record) : null;
  }

  async markStage(downloadId: string, stage: SoftwareInstallStage): Promise<void> {
    const existing = await this.getDownload(downloadId);
    if (!existing) return;
    const download = await this.updateDownload(downloadId, { stage });
    this.emit(download, stage === "done" ? 100 : undefined);
  }

  private downloadToTmp(
    downloadId: string,
    artifactMeta: SoftwareArtifactMeta,
    tmpPath: string,
    allowedHosts: string[]
  ): Promise<number> {
    const url = assertAllowedHttpsUrl(artifactMeta.downloadUrl, allowedHosts);

    return new Promise((resolve, reject) => {
      let bytesReceived = 0;
      let totalBytes = artifactMeta.expectedSizeBytes ?? null;
      const startedAt = Date.now();
      let lastEmitAt = 0;

      const output = fs.createWriteStream(tmpPath);
      const request = https.get(
        url,
        {
          headers: {
            "User-Agent": APP_USER_AGENT,
            Accept: "application/java-archive,application/octet-stream,*/*",
          },
        },
        (response) => {
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
            output.destroy();
            reject(new Error("Provider redirected the download unexpectedly"));
            return;
          }
          if (response.statusCode !== 200) {
            output.destroy();
            reject(new Error(`Download failed with HTTP ${response.statusCode}`));
            return;
          }

          const contentLength = Number(response.headers["content-length"]);
          if (Number.isFinite(contentLength) && contentLength > 0) {
            totalBytes = contentLength;
          }

          response.on("data", (chunk: Buffer) => {
            bytesReceived += chunk.length;
            const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
            const speed = Math.round(bytesReceived / elapsedSeconds);
            const eta =
              totalBytes && speed > 0
                ? Math.max(0, Math.round((totalBytes - bytesReceived) / speed))
                : null;
            const percent = totalBytes ? Math.min(98, (bytesReceived / totalBytes) * 100) : 0;

            const now = Date.now();
            if (now - lastEmitAt > 250) {
              lastEmitAt = now;
              this.updateDownload(downloadId, {
                status: "running",
                stage: "downloading",
                bytesReceived,
                totalBytes,
                speedBytesPerSec: speed,
                etaSeconds: eta,
              })
                .then((download) => this.emit(download, percent))
                .catch((error) => logger.warn({ error }, "Failed to update download progress"));
            }
          });

          response.pipe(output);
        }
      );

      this.active.set(downloadId, { request, tmpPath, cancelled: false });

      request.on("error", (error) => {
        output.destroy();
        reject(error);
      });

      output.on("error", reject);
      output.on("finish", () => {
        output.close(() => resolve(bytesReceived));
      });
    });
  }

  private async updateDownload(
    id: string,
    data: Partial<{
      status: SoftwareDownload["status"];
      bytesReceived: number;
      totalBytes: number | null;
      speedBytesPerSec: number;
      etaSeconds: number | null;
      stage: SoftwareInstallStage;
      error: string | null;
    }>
  ): Promise<SoftwareDownload> {
    const record = await prisma.softwareDownload.update({
      where: { id },
      data,
    });
    return toDownload(record);
  }

  emit(download: SoftwareDownload, percent?: number, error?: string): void {
    const resolvedPercent =
      percent ??
      (download.totalBytes && download.totalBytes > 0
        ? Math.min(100, (download.bytesReceived / download.totalBytes) * 100)
        : 0);
    const payload: SoftwareDownloadProgressPayload = {
      downloadId: download.id,
      provider: download.provider,
      minecraftVersion: download.minecraftVersion,
      buildId: download.buildId,
      status: download.status,
      stage: download.stage,
      bytesReceived: download.bytesReceived,
      totalBytes: download.totalBytes,
      percent: resolvedPercent,
      speedBytesPerSec: download.speedBytesPerSec,
      etaSeconds: download.etaSeconds,
      error,
    };
    getSoftwareSocketServer()?.emit("software:download-progress", payload);
  }
}

export const softwareDownloadService = new SoftwareDownloadService();
