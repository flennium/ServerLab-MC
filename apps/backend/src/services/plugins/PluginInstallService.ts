import fs from "fs";
import fsp from "fs/promises";
import https from "https";
import type { ClientRequest } from "http";
import path from "path";
import crypto from "crypto";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import { HttpError } from "../../middleware/error.js";
import { modrinthClient } from "./ModrinthClient.js";
import { pluginCompatibilityService } from "./PluginCompatibilityService.js";
import { getPluginSocketServer } from "./pluginEvents.js";
import { APP_USER_AGENT } from "@serverlab/shared";
import type {
  InstalledPlugin,
  ModrinthVersion,
  ModrinthVersionDependency,
  ModrinthVersionFile,
  PluginDependency,
  PluginInstallAction,
  PluginInstallJob,
  PluginInstallProgressPayload,
  PluginInstallStage,
  PluginInstallStatus,
} from "@serverlab/shared";

interface ActivePluginDownload {
  request: ClientRequest;
  tmpPath: string;
  cancelled: boolean;
}

interface InstallInput {
  serverId: string;
  projectId: string;
  versionId: string;
  allowWarning?: boolean;
  requestId?: string;
  action?: "install" | "update";
  existingPluginId?: string;
}

type DbPlugin = {
  id: string;
  serverId: string;
  source: string;
  contentType: string;
  sourceProjectId: string | null;
  sourceVersionId: string | null;
  slug: string | null;
  name: string;
  installedVersion: string;
  fileName: string;
  filePath: string;
  fileHashSha1: string | null;
  fileHashSha512: string | null;
  fileSizeBytes: number | null;
  enabled: boolean;
  status: string;
  updateAvailable: boolean;
  installedAt: Date | null;
  updatedAt: Date;
  lastCheckedAt: Date | null;
};

export class PluginInstallService {
  private readonly active = new Map<string, ActivePluginDownload>();

  async listInstalled(serverId: string): Promise<InstalledPlugin[]> {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    await this.ensurePluginFolders(server.path);
    const records = await prisma.plugin.findMany({
      where: { serverId },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    const plugins = await Promise.all(records.map((record) => this.toInstalled(record)));
    const manual = await this.scanManualPlugins(server.id, server.path, plugins);
    return [...plugins, ...manual];
  }

  async install(input: InstallInput): Promise<{
    job: PluginInstallJob;
    plugin: InstalledPlugin | null;
    dependencies: PluginDependency[];
    restartRequired: boolean;
  }> {
    const action = input.action ?? "install";
    const jobId = input.requestId ?? crypto.randomUUID();
    const server = await prisma.server.findUniqueOrThrow({ where: { id: input.serverId } });
    const running = server.status === "running" || server.status === "starting";
    await this.ensurePluginFolders(server.path);

    let job = await this.createJob({
      id: jobId,
      serverId: input.serverId,
      action,
      projectId: input.projectId,
      versionId: input.versionId,
    });
    this.emit(job, 0);

    try {
      const projectResult = await modrinthClient.getProject(input.projectId);
      const project = projectResult.project;
      job = await this.updateJob(jobId, { status: "running", stage: "checking-compatibility" });
      this.emit(job, 5);

      const version = await modrinthClient.getVersion(input.versionId);
      const compatibility = pluginCompatibilityService.check(server, version);
      if (compatibility.status === "incompatible") {
        throw new HttpError(409, compatibility.reason, "plugin", "warning", "Choose a version that matches this server.");
      }
      if (compatibility.status === "warning" && !input.allowWarning) {
        throw new HttpError(409, compatibility.reason, "plugin", "warning", "Confirm the compatibility warning to install anyway.");
      }

      job = await this.updateJob(jobId, { stage: "resolving-dependencies" });
      this.emit(job, 10);
      const dependencyNames = await modrinthClient.getProjectNames(
        version.dependencies
          .map((dependency) => dependency.projectId)
          .filter((projectId): projectId is string => Boolean(projectId))
      );
      const blockingDependency = version.dependencies.find(
        (dependency) => dependency.dependencyType === "incompatible" && dependency.projectId
      );
      if (blockingDependency?.projectId) {
        const name = dependencyNames.get(blockingDependency.projectId) ?? blockingDependency.projectId;
        throw new HttpError(409, `${project.title} conflicts with ${name}.`, "plugin", "warning", "Remove the incompatible plugin or choose another version.");
      }

      const file = selectJarFile(version);
      const finalFileName = sanitizePluginFileName(file.filename || `${project.slug}-${version.versionNumber}.jar`);
      const tmpPath = path.join(server.path, "plugins", ".staging", `${jobId}.jar.tmp`);
      const finalRelativePath = toPosix(path.join("plugins", finalFileName));
      const finalPath = this.resolveInside(server.path, finalRelativePath);
      let backupPath: string | null = null;

      job = await this.updateJob(jobId, { stage: "downloading" });
      const sizeBytes = await this.downloadToTmp(jobId, file, tmpPath);

      job = await this.updateJob(jobId, {
        stage: "verifying",
        bytesReceived: sizeBytes,
        totalBytes: file.size || sizeBytes,
        etaSeconds: 0,
      });
      this.emit(job, 94);
      await verifyHash(tmpPath, file);

      job = await this.updateJob(jobId, { stage: "installing" });
      this.emit(job, 97);
      const existing = await this.findExistingPlugin(input.serverId, input.projectId, input.existingPluginId);
      if (existing && fs.existsSync(this.resolveInside(server.path, existing.filePath))) {
        backupPath = await this.backupExisting(server.path, existing, version.versionNumber);
      } else if (fs.existsSync(finalPath)) {
        backupPath = await this.backupPlainFile(server.path, finalRelativePath, version.versionNumber);
      }
      await fsp.mkdir(path.dirname(finalPath), { recursive: true });
      await fsp.rename(tmpPath, finalPath);

      job = await this.updateJob(jobId, { stage: "updating-records" });
      this.emit(job, 99);
      const plugin = await prisma.plugin.upsert({
        where: {
          serverId_source_sourceProjectId: {
            serverId: input.serverId,
            source: "modrinth",
            sourceProjectId: project.id,
          },
        },
        update: {
          sourceVersionId: version.id,
          slug: project.slug,
          name: project.title,
          installedVersion: version.versionNumber,
          fileName: finalFileName,
          filePath: finalRelativePath,
          fileHashSha1: file.hashes.sha1 ?? null,
          fileHashSha512: file.hashes.sha512 ?? null,
          fileSizeBytes: sizeBytes,
          enabled: true,
          status: "installed",
          updateAvailable: false,
          installedAt: new Date(),
          lastCheckedAt: new Date(),
        },
        create: {
          serverId: input.serverId,
          source: "modrinth",
          contentType: "plugin",
          sourceProjectId: project.id,
          sourceVersionId: version.id,
          slug: project.slug,
          name: project.title,
          installedVersion: version.versionNumber,
          fileName: finalFileName,
          filePath: finalRelativePath,
          fileHashSha1: file.hashes.sha1 ?? null,
          fileHashSha512: file.hashes.sha512 ?? null,
          fileSizeBytes: sizeBytes,
          enabled: true,
          status: "installed",
          updateAvailable: false,
          installedAt: new Date(),
          lastCheckedAt: new Date(),
        },
      });
      await prisma.pluginDependency.deleteMany({ where: { pluginId: plugin.id } });
      const dependencyData = dependencyRows(plugin.id, version.dependencies, dependencyNames);
      if (dependencyData.length > 0) {
        await prisma.pluginDependency.createMany({ data: dependencyData });
      }
      const dependencies = await prisma.pluginDependency.findMany({ where: { pluginId: plugin.id } });
      const completed = await this.updateJob(jobId, {
        pluginId: plugin.id,
        status: "completed",
        stage: "done",
        bytesReceived: sizeBytes,
        totalBytes: sizeBytes,
        speedBytesPerSec: 0,
        etaSeconds: 0,
      });
      this.emit(completed, 100);
      logger.info({ pluginId: plugin.id, projectId: project.id, versionId: version.id, backupPath }, "Plugin installed");
      return {
        job: completed,
        plugin: await this.toInstalled(plugin),
        dependencies: dependencies.map(toDependency),
        restartRequired: running,
      };
    } catch (error) {
      await fsp.rm(path.join(server.path, "plugins", ".staging", `${jobId}.jar.tmp`), { force: true }).catch(() => {});
      const active = this.active.get(jobId);
      const message = error instanceof Error ? error.message : "Plugin install failed";
      const failed = await this.updateJob(jobId, {
        status: active?.cancelled ? "cancelled" : "failed",
        stage: active?.cancelled ? "cancelled" : "failed",
        error: message,
      });
      this.emit(failed, active?.cancelled ? 0 : undefined, message);
      throw error;
    } finally {
      this.active.delete(jobId);
    }
  }

  async updatePlugin(serverId: string, pluginId: string): Promise<{
    job: PluginInstallJob;
    plugin: InstalledPlugin | null;
    dependencies: PluginDependency[];
    restartRequired: boolean;
  }> {
    const plugin = await prisma.plugin.findUniqueOrThrow({ where: { id: pluginId } });
    if (plugin.serverId !== serverId || !plugin.sourceProjectId) {
      throw new HttpError(400, "This plugin cannot be updated from Modrinth.", "plugin", "warning");
    }
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    const { versions } = await modrinthClient.listVersions(plugin.sourceProjectId);
    const nextVersion = versions.find((version) =>
      pluginCompatibilityService.check(server, version).status === "compatible"
    );
    if (!nextVersion) {
      throw new HttpError(404, "No compatible Modrinth update is available.", "plugin", "warning");
    }
    if (nextVersion.id === plugin.sourceVersionId) {
      const job = await this.createCompletedJob(serverId, plugin.id, "update", plugin.sourceProjectId, nextVersion.id);
      return { job, plugin: await this.toInstalled(plugin), dependencies: [], restartRequired: false };
    }
    return this.install({
      serverId,
      projectId: plugin.sourceProjectId,
      versionId: nextVersion.id,
      allowWarning: false,
      action: "update",
      existingPluginId: plugin.id,
    });
  }

  async cancel(jobId: string): Promise<PluginInstallJob> {
    const active = this.active.get(jobId);
    if (active) {
      active.cancelled = true;
      active.request.destroy(new Error("Plugin download cancelled"));
      await fsp.rm(active.tmpPath, { force: true }).catch(() => {});
    }
    const job = await this.updateJob(jobId, {
      status: "cancelled",
      stage: "cancelled",
      error: "Plugin download cancelled",
    });
    this.emit(job, 0, "Plugin download cancelled");
    return job;
  }

  async disable(serverId: string, pluginId: string): Promise<InstalledPlugin> {
    return this.movePlugin(serverId, pluginId, "disable", "plugins/.disabled", "disabled", false);
  }

  async enable(serverId: string, pluginId: string): Promise<InstalledPlugin> {
    const plugin = await prisma.plugin.findUniqueOrThrow({ where: { id: pluginId } });
    return this.movePlugin(serverId, pluginId, "enable", "plugins", "installed", true, plugin.fileName);
  }

  async remove(serverId: string, pluginId: string): Promise<InstalledPlugin> {
    return this.movePlugin(serverId, pluginId, "remove", `plugins/.trash/${Date.now()}`, "trashed", false);
  }

  async restore(serverId: string, pluginId: string): Promise<InstalledPlugin> {
    const plugin = await prisma.plugin.findUniqueOrThrow({ where: { id: pluginId } });
    return this.movePlugin(serverId, pluginId, "restore", "plugins", "installed", true, plugin.fileName);
  }

  async cleanupStaging(): Promise<void> {
    const servers = await prisma.server.findMany();
    await Promise.all(
      servers.map((server) =>
        fsp.rm(path.join(server.path, "plugins", ".staging"), { recursive: true, force: true })
          .then(() => fsp.mkdir(path.join(server.path, "plugins", ".staging"), { recursive: true }))
          .catch((error) => logger.warn({ error, serverId: server.id }, "Failed to clean plugin staging"))
      )
    );
  }

  private async movePlugin(
    serverId: string,
    pluginId: string,
    action: PluginInstallAction,
    targetDirectory: string,
    status: "installed" | "disabled" | "trashed",
    enabled: boolean,
    fileNameOverride?: string
  ): Promise<InstalledPlugin> {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    const plugin = await prisma.plugin.findUniqueOrThrow({ where: { id: pluginId } });
    if (plugin.serverId !== serverId) throw new HttpError(404, "Plugin not found.", "plugin", "warning");

    const source = this.resolveInside(server.path, plugin.filePath);
    const fileName = sanitizePluginFileName(fileNameOverride ?? plugin.fileName);
    const targetRelative = toPosix(path.join(targetDirectory, fileName));
    const target = this.resolveInside(server.path, targetRelative);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    if (fs.existsSync(source)) await fsp.rename(source, target);

    await this.createCompletedJob(serverId, pluginId, action, plugin.sourceProjectId, plugin.sourceVersionId);
    const updated = await prisma.plugin.update({
      where: { id: pluginId },
      data: {
        enabled,
        status,
        filePath: targetRelative,
        fileName,
      },
    });
    return this.toInstalled(updated);
  }

  private async scanManualPlugins(
    serverId: string,
    serverPath: string,
    managed: InstalledPlugin[]
  ): Promise<InstalledPlugin[]> {
    const pluginDir = path.join(serverPath, "plugins");
    const entries = await fsp.readdir(pluginDir, { withFileTypes: true }).catch(() => []);
    const managedPaths = new Set(managed.map((plugin) => plugin.filePath));
    const manual: InstalledPlugin[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".jar")) continue;
      const relativePath = toPosix(path.join("plugins", entry.name));
      if (managedPaths.has(relativePath)) continue;
      const stat = await fsp.stat(path.join(pluginDir, entry.name)).catch(() => null);
      manual.push({
        id: `manual:${Buffer.from(entry.name).toString("base64url")}`,
        serverId,
        source: "manual",
        contentType: "plugin",
        sourceProjectId: null,
        sourceVersionId: null,
        slug: null,
        name: entry.name.replace(/\.jar$/i, ""),
        installedVersion: "manual",
        fileName: entry.name,
        filePath: relativePath,
        fileHashSha1: null,
        fileHashSha512: null,
        fileSizeBytes: stat?.size ?? null,
        enabled: true,
        status: "manual",
        updateAvailable: false,
        installedAt: stat?.birthtime ?? null,
        updatedAt: stat?.mtime ?? new Date(),
        lastCheckedAt: null,
      });
    }
    return manual;
  }

  private async findExistingPlugin(
    serverId: string,
    projectId: string,
    existingPluginId?: string
  ): Promise<DbPlugin | null> {
    if (existingPluginId) {
      return prisma.plugin.findFirst({ where: { id: existingPluginId, serverId } });
    }
    return prisma.plugin.findFirst({
      where: { serverId, source: "modrinth", sourceProjectId: projectId },
    });
  }

  private async backupExisting(
    serverPath: string,
    plugin: DbPlugin,
    version: string
  ): Promise<string> {
    return this.backupPlainFile(serverPath, plugin.filePath, version);
  }

  private async backupPlainFile(
    serverPath: string,
    relativePath: string,
    version: string
  ): Promise<string> {
    const source = this.resolveInside(serverPath, relativePath);
    const parsed = path.parse(relativePath);
    const backupRelative = toPosix(
      path.join("plugins", ".backups", parsed.name, `${Date.now()}-${sanitizePathSegment(version)}-${parsed.base}`)
    );
    const backup = this.resolveInside(serverPath, backupRelative);
    await fsp.mkdir(path.dirname(backup), { recursive: true });
    await fsp.rename(source, backup);
    return backupRelative;
  }

  private ensurePluginFolders(serverPath: string): Promise<void> {
    return fsp.mkdir(path.join(serverPath, "plugins", ".staging"), { recursive: true });
  }

  private resolveInside(serverPath: string, relativePath: string): string {
    const root = path.resolve(serverPath);
    const target = path.resolve(root, relativePath);
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Plugin path escapes server root: ${relativePath}`);
    }
    return target;
  }

  private async createJob(input: {
    id: string;
    serverId: string;
    action: PluginInstallAction;
    pluginId?: string | null;
    projectId?: string | null;
    versionId?: string | null;
  }): Promise<PluginInstallJob> {
    const record = await prisma.pluginInstallJob.upsert({
      where: { id: input.id },
      update: {
        serverId: input.serverId,
        pluginId: input.pluginId ?? null,
        projectId: input.projectId ?? null,
        versionId: input.versionId ?? null,
        action: input.action,
        status: "queued",
        stage: "resolving-project",
        bytesReceived: 0,
        totalBytes: null,
        speedBytesPerSec: 0,
        etaSeconds: null,
        error: null,
      },
      create: {
        id: input.id,
        serverId: input.serverId,
        pluginId: input.pluginId ?? null,
        projectId: input.projectId ?? null,
        versionId: input.versionId ?? null,
        action: input.action,
      },
    });
    return toJob(record);
  }

  private async createCompletedJob(
    serverId: string,
    pluginId: string,
    action: PluginInstallAction,
    projectId: string | null,
    versionId: string | null
  ): Promise<PluginInstallJob> {
    const record = await prisma.pluginInstallJob.create({
      data: {
        id: crypto.randomUUID(),
        serverId,
        pluginId,
        projectId,
        versionId,
        action,
        status: "completed",
        stage: "done",
        etaSeconds: 0,
      },
    });
    return toJob(record);
  }

  private async updateJob(
    id: string,
    data: Partial<{
      pluginId: string | null;
      status: PluginInstallStatus;
      stage: PluginInstallStage;
      bytesReceived: number;
      totalBytes: number | null;
      speedBytesPerSec: number;
      etaSeconds: number | null;
      error: string | null;
    }>
  ): Promise<PluginInstallJob> {
    const record = await prisma.pluginInstallJob.update({
      where: { id },
      data,
    });
    return toJob(record);
  }

  private downloadToTmp(
    jobId: string,
    file: ModrinthVersionFile,
    tmpPath: string
  ): Promise<number> {
    const url = modrinthClient.assertAllowedDownloadUrl(file.url);
    return new Promise((resolve, reject) => {
      let bytesReceived = 0;
      const totalBytes = file.size || null;
      const startedAt = Date.now();
      let lastEmitAt = 0;

      fsp.mkdir(path.dirname(tmpPath), { recursive: true })
        .then(() => {
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
                reject(new Error("Modrinth redirected the download unexpectedly"));
                return;
              }
              if (response.statusCode !== 200) {
                output.destroy();
                reject(new Error(`Plugin download failed with HTTP ${response.statusCode}`));
                return;
              }

              response.on("data", (chunk: Buffer) => {
                bytesReceived += chunk.length;
                const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
                const speed = Math.round(bytesReceived / elapsedSeconds);
                const eta =
                  totalBytes && speed > 0
                    ? Math.max(0, Math.round((totalBytes - bytesReceived) / speed))
                    : null;
                const percent = totalBytes ? Math.min(92, (bytesReceived / totalBytes) * 92) : 0;
                const now = Date.now();
                if (now - lastEmitAt > 250) {
                  lastEmitAt = now;
                  this.updateJob(jobId, {
                    status: "running",
                    stage: "downloading",
                    bytesReceived,
                    totalBytes,
                    speedBytesPerSec: speed,
                    etaSeconds: eta,
                  })
                    .then((job) => this.emit(job, percent))
                    .catch((error) => logger.warn({ error }, "Failed to update plugin progress"));
                }
              });

              response.pipe(output);
            }
          );
          this.active.set(jobId, { request, tmpPath, cancelled: false });
          request.on("error", (error) => {
            output.destroy();
            reject(error);
          });
          output.on("error", reject);
          output.on("finish", () => {
            output.close(() => resolve(bytesReceived));
          });
        })
        .catch(reject);
    });
  }

  private emit(job: PluginInstallJob, percent?: number, error?: string): void {
    const resolvedPercent =
      percent ??
      (job.totalBytes && job.totalBytes > 0
        ? Math.min(100, (job.bytesReceived / job.totalBytes) * 100)
        : 0);
    const payload: PluginInstallProgressPayload = {
      jobId: job.id,
      serverId: job.serverId,
      pluginId: job.pluginId,
      projectId: job.projectId,
      versionId: job.versionId,
      action: job.action,
      status: job.status,
      stage: job.stage,
      bytesReceived: job.bytesReceived,
      totalBytes: job.totalBytes,
      percent: resolvedPercent,
      speedBytesPerSec: job.speedBytesPerSec,
      etaSeconds: job.etaSeconds,
      error,
    };
    getPluginSocketServer()?.emit("plugin:install-progress", payload);
  }

  private async toInstalled(record: DbPlugin): Promise<InstalledPlugin> {
    const exists = await prisma.server
      .findUnique({ where: { id: record.serverId } })
      .then((server) =>
        server
          ? fsp.stat(this.resolveInside(server.path, record.filePath)).then(() => true).catch(() => false)
          : false
      );
    const status = exists ? record.status : record.status === "trashed" ? "trashed" : "missing";
    return {
      id: record.id,
      serverId: record.serverId,
      source: record.source === "manual" ? "manual" : "modrinth",
      contentType: "plugin",
      sourceProjectId: record.sourceProjectId,
      sourceVersionId: record.sourceVersionId,
      slug: record.slug,
      name: record.name,
      installedVersion: record.installedVersion,
      fileName: record.fileName,
      filePath: record.filePath,
      fileHashSha1: record.fileHashSha1,
      fileHashSha512: record.fileHashSha512,
      fileSizeBytes: record.fileSizeBytes,
      enabled: record.enabled,
      status,
      updateAvailable: record.updateAvailable,
      installedAt: record.installedAt,
      updatedAt: record.updatedAt,
      lastCheckedAt: record.lastCheckedAt,
    };
  }
}

function selectJarFile(version: ModrinthVersion): ModrinthVersionFile {
  const file =
    version.files.find((item) => item.primary && item.filename.toLowerCase().endsWith(".jar")) ??
    version.files.find((item) => item.filename.toLowerCase().endsWith(".jar"));
  if (!file) throw new Error("This Modrinth version does not include a plugin jar.");
  if (!file.hashes.sha1 && !file.hashes.sha512) {
    throw new Error("This Modrinth file does not include a verifiable hash.");
  }
  return file;
}

function dependencyRows(
  pluginId: string,
  dependencies: ModrinthVersionDependency[],
  names: Map<string, string>
): Array<{
  pluginId: string;
  dependsOnProjectId: string;
  dependsOnVersionId: string | null;
  dependsOnName: string | null;
  dependencyType: string;
}> {
  return dependencies
    .filter((dependency) => dependency.projectId)
    .map((dependency) => ({
      pluginId,
      dependsOnProjectId: dependency.projectId!,
      dependsOnVersionId: dependency.versionId,
      dependsOnName: names.get(dependency.projectId!) ?? dependency.fileName,
      dependencyType: dependency.dependencyType,
    }));
}

function toJob(record: {
  id: string;
  serverId: string;
  pluginId: string | null;
  projectId: string | null;
  versionId: string | null;
  action: string;
  status: string;
  stage: string;
  bytesReceived: number;
  totalBytes: number | null;
  speedBytesPerSec: number;
  etaSeconds: number | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PluginInstallJob {
  return {
    id: record.id,
    serverId: record.serverId,
    pluginId: record.pluginId,
    projectId: record.projectId,
    versionId: record.versionId,
    action: record.action as PluginInstallAction,
    status: record.status as PluginInstallStatus,
    stage: record.stage as PluginInstallStage,
    bytesReceived: record.bytesReceived,
    totalBytes: record.totalBytes,
    speedBytesPerSec: record.speedBytesPerSec,
    etaSeconds: record.etaSeconds,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toDependency(record: {
  id: string;
  pluginId: string;
  dependsOnProjectId: string;
  dependsOnVersionId: string | null;
  dependsOnName: string | null;
  dependencyType: string;
  resolvedPluginId: string | null;
}): PluginDependency {
  return {
    id: record.id,
    pluginId: record.pluginId,
    dependsOnProjectId: record.dependsOnProjectId,
    dependsOnVersionId: record.dependsOnVersionId,
    dependsOnName: record.dependsOnName,
    dependencyType: record.dependencyType as PluginDependency["dependencyType"],
    resolvedPluginId: record.resolvedPluginId,
  };
}

async function verifyHash(filePath: string, file: ModrinthVersionFile): Promise<void> {
  if (file.hashes.sha512) {
    const actual = await calculateHash(filePath, "sha512");
    if (actual.toLowerCase() !== file.hashes.sha512.toLowerCase()) {
      throw new Error("Downloaded plugin hash does not match Modrinth metadata");
    }
    return;
  }
  if (file.hashes.sha1) {
    const actual = await calculateHash(filePath, "sha1");
    if (actual.toLowerCase() !== file.hashes.sha1.toLowerCase()) {
      throw new Error("Downloaded plugin hash does not match Modrinth metadata");
    }
  }
}

function calculateHash(filePath: string, algorithm: "sha1" | "sha512"): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function sanitizePluginFileName(name: string): string {
  const cleaned = path
    .basename(name)
    .replace(/[<>:"/\\|?*]+/g, "-")
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? "-" : character))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const jarName = cleaned.toLowerCase().endsWith(".jar") ? cleaned : `${cleaned}.jar`;
  return jarName || "plugin.jar";
}

function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) || "version";
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

export const pluginInstallService = new PluginInstallService();
