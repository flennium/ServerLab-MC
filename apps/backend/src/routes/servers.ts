import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { isIP } from "net";
import { prisma } from "../lib/prisma.js";
import { serverManager } from "../services/ServerManager.js";
import { FileConflictError, FileExistsError, FileManager } from "../services/FileManager.js";
import { createBackup } from "../services/BackupService.js";
import { softwareDownloadService } from "../services/software/SoftwareDownloadService.js";
import { serverSoftwareInstaller } from "../services/software/ServerSoftwareInstaller.js";
import { softwareCacheService } from "../services/software/SoftwareCacheService.js";
import { spigotBuildService } from "../services/software/SpigotBuildService.js";
import { javaRuntimeRegistry } from "../services/java/JavaRuntimeRegistry.js";
import { javaRuntimeValidator } from "../services/java/JavaRuntimeValidator.js";
import { javaRecommendationService } from "../services/java/JavaRecommendationService.js";
import {
  PortConflictError,
  portManagerService,
} from "../services/PortManagerService.js";
import { pluginInstallService } from "../services/plugins/PluginInstallService.js";
import { softwareProviderRegistry } from "../services/software/providers.js";
import { logger } from "../lib/logger.js";
import { HttpError, badRequest } from "../middleware/error.js";
import type {
  AssignServerJavaRuntimeDto,
  CreateServerDto,
  UpdateServerDto,
  SendCommandDto,
  WriteFileDto,
  CreateFileDto,
  CreateFolderDto,
  DuplicateFileDto,
  PluginInstallRequest,
  ServerDeleteProgressPayload,
  SoftwareArtifact,
} from "@serverlab/shared";

export const serverRoutes = Router();

function emitDeleteProgress(payload: ServerDeleteProgressPayload): void {
  serverManager.emitDeleteProgress(payload);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequest(`${field} is required`);
  }
  return value.trim();
}

async function ensureUniqueServerName(name: string, excludeId?: string): Promise<void> {
  const normalized = name.trim().toLocaleLowerCase();
  const servers = await prisma.server.findMany({
    select: { id: true, name: true },
  });
  const duplicate = servers.find(
    (server) => server.id !== excludeId && server.name.trim().toLocaleLowerCase() === normalized
  );
  if (duplicate) {
    throw badRequest("A server with this name already exists.", "server");
  }
}

function optionalInt(
  value: unknown,
  field: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw badRequest(`${field} must be between ${min} and ${max}`);
  }
  return parsed;
}

function validateBindAddress(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || (!isIP(value) && !/^[a-zA-Z0-9.-]+$/.test(value))) {
    throw badRequest("bindAddress must be a valid IP address or hostname");
  }
  return value;
}

function validateCreateServer(body: CreateServerDto): void {
  requireText(body.name, "name");
  requireText(body.path, "path");
  requireText(body.version, "version");
  requireText(body.software, "software");
  if (!body.softwareSource) requireText(body.javaPath, "javaPath");
  optionalInt(body.ramMinMb, "ramMinMb", 128, 262144);
  optionalInt(body.ramMaxMb, "ramMaxMb", 128, 262144);
  optionalInt(body.port, "port", 1, 65535);
  validateBindAddress(body.bindAddress);
  if (body.ramMinMb && body.ramMaxMb && body.ramMinMb > body.ramMaxMb) {
    throw badRequest("ramMinMb cannot be greater than ramMaxMb");
  }
}

function portConflictToHttp(error: PortConflictError): HttpError {
  return new HttpError(
    409,
    error.status.message,
    "server",
    "warning",
    error.status.suggestedPort
      ? `Use port ${error.status.suggestedPort} or close the process using port ${error.status.port}.`
      : `Choose another port or close the process using port ${error.status.port}.`,
    ["retry", "copy-details", "dismiss"]
  );
}

async function resolveJavaSelection(input: {
  version: string;
  software: string;
  javaRuntimeId?: string | null;
  javaPath: string;
  javaOverrideMode?: string;
  allowUnsupportedJava?: boolean;
  strict: boolean;
  artifactPath?: string;
  serverId?: string;
}): Promise<{
  javaRuntimeId: string | null;
  javaPath: string;
  javaOverrideMode: string;
  allowUnsupportedJava: boolean;
  recommendation: Awaited<ReturnType<typeof javaRecommendationService.recommend>>;
}> {
  const javaOverrideMode =
    input.javaOverrideMode ?? (input.strict || input.javaRuntimeId ? "automatic" : "manual");
  const allowUnsupportedJava = input.allowUnsupportedJava ?? false;

  const recommendation = await javaRecommendationService.recommend({
    minecraftVersion: input.version,
    software: input.software,
    artifactPath: input.artifactPath,
    serverId: input.serverId,
  });

  if (
    input.strict &&
    (recommendation.status === "ambiguous" || recommendation.status === "unavailable") &&
    !allowUnsupportedJava &&
    javaOverrideMode !== "manual"
  ) {
    throw badRequest(
      "The server JAR Java requirement could not be confirmed. Rescan the artifact or explicitly enable the advanced compatibility override.",
      "java"
    );
  }

  if (javaOverrideMode === "manual") {
    try {
      const validated = await javaRuntimeValidator.validateExecutable(input.javaPath || "java");
      if (!javaRecommendationService.isCompatible(
        validated.major,
        recommendation.requiredMajor,
        allowUnsupportedJava,
        input.software,
        recommendation.maximumMajor
      )) {
        throw new Error(`Java ${recommendation.requiredMajor} is required for ${input.software}.`);
      }
    } catch (error) {
      throw badRequest(
        error instanceof Error
          ? error.message
          : "Java executable could not be validated"
      );
    }
    return {
      javaRuntimeId: null,
      javaPath: input.javaPath || "java",
      javaOverrideMode,
      allowUnsupportedJava,
      recommendation,
    };
  }

  let runtime = input.javaRuntimeId
    ? await javaRuntimeRegistry.getRuntime(input.javaRuntimeId)
    : null;
  if (!runtime) runtime = recommendation.compatibleRuntime;
  if (!runtime) {
    if (input.strict) {
      throw badRequest(
        `Java ${recommendation.requiredMajor} is required. Install or select a compatible runtime.`
      );
    }
    return {
      javaRuntimeId: null,
      javaPath: input.javaPath || "java",
      javaOverrideMode: "manual",
      allowUnsupportedJava,
      recommendation,
    };
  }

  let validated = await javaRuntimeValidator.validateRuntime(runtime);
  const selectedIsCompatible =
    validated.status === "valid" &&
    javaRecommendationService.isCompatible(
      validated.major,
      recommendation.requiredMajor,
      allowUnsupportedJava,
      input.software,
      recommendation.maximumMajor
    );

  if (!selectedIsCompatible) {
    const replacement = recommendation.compatibleRuntime;
    if (replacement) {
      validated = await javaRuntimeValidator.validateRuntime(replacement);
    }
  }

  if (
    validated.status !== "valid" ||
    !javaRecommendationService.isCompatible(
      validated.major,
      recommendation.requiredMajor,
      allowUnsupportedJava,
      input.software,
      recommendation.maximumMajor
    )
  ) {
    throw badRequest(
      `Selected Java runtime is not compatible. Java ${recommendation.requiredMajor} is required.`
    );
  }

  return {
    javaRuntimeId: validated.id,
    javaPath: validated.executablePath,
    javaOverrideMode: "automatic",
    allowUnsupportedJava,
    recommendation,
  };
}

async function refreshJavaRequirement(serverId: string, serverPath: string): Promise<void> {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
  const recommendation = await javaRecommendationService.recommend({
    minecraftVersion: server.version,
    software: server.software,
    artifactPath: path.join(serverPath, "server.jar"),
    serverId,
  });
  const canAutoSelect =
    server.javaOverrideMode === "automatic" &&
    recommendation.status !== "ambiguous" &&
    recommendation.status !== "unavailable" &&
    recommendation.compatibleRuntime;
  await prisma.server.update({
    where: { id: serverId },
    data: {
      javaRuntimeId: canAutoSelect ? recommendation.compatibleRuntime!.id : undefined,
      javaPath: canAutoSelect ? recommendation.compatibleRuntime!.executablePath : undefined,
      javaRequirementMajor: recommendation.detection?.requiredMajor ?? recommendation.minimumMajor,
      javaRequirementConfidence: recommendation.detection?.confidence ?? null,
      javaRequirementMethod: recommendation.detection?.method ?? null,
      javaRequirementDetails: JSON.stringify({
        minimumMajor: recommendation.minimumMajor,
        maximumMajor: recommendation.maximumMajor,
        status: recommendation.status,
        artifactSha256: recommendation.artifactSha256,
        artifactSizeBytes: recommendation.artifactSizeBytes,
        artifactCheckedAt: recommendation.artifactCheckedAt,
        indicators: recommendation.detection?.indicators ?? [],
        warnings: recommendation.warnings,
      }),
      javaRequirementDetectedAt: new Date(),
    },
  });
}

// GET /api/servers
serverRoutes.get("/", async (_req, res, next) => {
  try {
    const servers = await prisma.server.findMany({ orderBy: { createdAt: "asc" } });
    res.json({ servers });
  } catch (err) {
    next(err);
  }
});

// POST /api/servers
serverRoutes.post("/", async (req, res, next) => {
  try {
    const body = req.body as CreateServerDto;
    validateCreateServer(body);
    await ensureUniqueServerName(body.name);
    let version = body.version;
    let software = body.software;
    let softwareBuildId: string | null = null;
    let targetMinecraftVersion = body.targetMinecraftVersion ?? null;
    const selectedProvider = softwareProviderRegistry.find(software);
    let kind = body.kind ?? selectedProvider?.kind ?? "server";
    let requiresEula = selectedProvider?.requiresEula ?? true;

    if (body.softwareSource) {
      const sourceProvider = softwareProviderRegistry.get(body.softwareSource.provider);
      kind = sourceProvider.kind;
      requiresEula = sourceProvider.requiresEula;
      if (requiresEula && !body.eulaAccepted) {
        throw badRequest("Minecraft EULA acceptance is required");
      }
      version = body.softwareSource.minecraftVersion;
      software = body.softwareSource.provider;
      softwareBuildId = body.softwareSource.buildId;
      targetMinecraftVersion = body.softwareSource.targetMinecraftVersion ?? targetMinecraftVersion;
      if (body.softwareSource.provider === "spigot" && body.softwareSource.sourceType !== "build") {
        throw badRequest("Spigot servers must be created from a completed BuildTools job.", "download");
      }
    }

    const bindAddress = body.bindAddress ?? "0.0.0.0";
    const port = body.port ?? (await portManagerService.suggestPort());
    await portManagerService.assertAvailableForServer(port, null, bindAddress);

    const requestId = body.softwareSource?.requestId;
    let artifact: SoftwareArtifact | null = null;
    if (body.softwareSource) {
      if (body.softwareSource.sourceType === "build" || body.softwareSource.provider === "spigot") {
        artifact = await softwareCacheService.findValidArtifact(
          "spigot",
          body.softwareSource.minecraftVersion,
          body.softwareSource.buildId
        );
        if (!artifact && body.softwareSource.buildJobId) {
          const job = await spigotBuildService.getJob(body.softwareSource.buildJobId);
          if (
            !job ||
            job.status !== "completed" ||
            job.provider !== "spigot" ||
            job.minecraftVersion !== body.softwareSource.minecraftVersion ||
            job.buildId !== body.softwareSource.buildId
          ) {
            throw badRequest("The selected Spigot BuildTools job is not complete or does not match this revision.", "download");
          }
          artifact = await softwareCacheService.findValidArtifact(
            "spigot",
            body.softwareSource.minecraftVersion,
            body.softwareSource.buildId
          );
        }
        if (!artifact) throw badRequest("The completed Spigot artifact is no longer available. Build it again.", "download");
      } else {
        const result = await softwareDownloadService.ensureArtifact({
          provider: body.softwareSource.provider,
          minecraftVersion: body.softwareSource.minecraftVersion,
          buildId: body.softwareSource.buildId,
          requestId,
        });
        artifact = result.artifact;
      }
    }

    const javaSelection = await resolveJavaSelection({
      version,
      software,
      javaRuntimeId: body.javaRuntimeId,
      javaPath: body.javaPath,
      javaOverrideMode: body.javaOverrideMode,
      allowUnsupportedJava: body.allowUnsupportedJava,
      strict: Boolean(body.softwareSource),
      artifactPath: artifact?.cachedPath ?? path.join(body.path, "server.jar"),
    });

    if (artifact) {
      if (requestId) await softwareDownloadService.markStage(requestId, "installing-server-files");
      await serverSoftwareInstaller.install({
        artifact,
        serverPath: body.path,
        eulaAccepted: body.eulaAccepted === true,
        requiresEula,
      });
      if (requestId) {
        if (requiresEula) await softwareDownloadService.markStage(requestId, "writing-eula");
        await softwareDownloadService.markStage(requestId, "done");
      }
    }

    const server = await prisma.server.create({
      data: {
        name: body.name,
        path: body.path,
        version,
        software,
        kind,
        softwareBuildId,
        targetMinecraftVersion,
        bindAddress,
        configurationState: kind === "proxy" ? "needs-setup" : "ready",
        javaRequirementMajor: javaSelection.recommendation.detection?.requiredMajor ?? null,
        javaRequirementConfidence: javaSelection.recommendation.detection?.confidence ?? null,
        javaRequirementMethod: javaSelection.recommendation.detection?.method ?? null,
        javaRequirementDetails: javaSelection.recommendation.detection
          ? JSON.stringify({
              minimumMajor: javaSelection.recommendation.minimumMajor,
              maximumMajor: javaSelection.recommendation.maximumMajor,
              status: javaSelection.recommendation.status,
              artifactSha256: javaSelection.recommendation.artifactSha256,
              artifactSizeBytes: javaSelection.recommendation.artifactSizeBytes,
              artifactCheckedAt: javaSelection.recommendation.artifactCheckedAt,
              indicators: javaSelection.recommendation.detection.indicators,
              warnings: javaSelection.recommendation.detection.warnings,
            })
          : null,
        javaRequirementDetectedAt: javaSelection.recommendation.detection ? new Date() : null,
        javaPath: javaSelection.javaPath,
        javaRuntimeId: javaSelection.javaRuntimeId,
        javaOverrideMode: javaSelection.javaOverrideMode,
        allowUnsupportedJava: javaSelection.allowUnsupportedJava,
        ramMinMb: body.ramMinMb ?? 1024,
        ramMaxMb: body.ramMaxMb ?? 4096,
        port,
        startupArgs: body.startupArgs ?? null,
        autoStart: body.autoStart ?? false,
      },
    });
    res.status(201).json({ server });
  } catch (err) {
    if (err instanceof PortConflictError) {
      next(portConflictToHttp(err));
      return;
    }
    next(err);
  }
});

// GET /api/servers/:id
serverRoutes.get("/:id", async (req, res, next) => {
  try {
    const server = await prisma.server.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    res.json({ server });
  } catch (err) {
    next(err);
  }
});

// POST /api/servers/:id/java/refresh
serverRoutes.post("/:id/java/refresh", async (req, res, next) => {
  try {
    const existing = await prisma.server.findUniqueOrThrow({ where: { id: req.params.id } });
    const recommendation = await javaRecommendationService.recommend({
      minecraftVersion: existing.version,
      software: existing.software,
      artifactPath: path.join(existing.path, "server.jar"),
      serverId: existing.id,
    });

    let server = existing;
    if (
      existing.javaOverrideMode === "automatic" &&
      recommendation.status !== "ambiguous" &&
      recommendation.status !== "unavailable" &&
      recommendation.compatibleRuntime &&
      recommendation.compatibleRuntime.id !== existing.javaRuntimeId
    ) {
      server = await prisma.server.update({
        where: { id: existing.id },
        data: {
          javaRuntimeId: recommendation.compatibleRuntime.id,
          javaPath: recommendation.compatibleRuntime.executablePath,
          javaRequirementMajor: recommendation.minimumMajor,
          javaRequirementConfidence: recommendation.detection?.confidence ?? null,
          javaRequirementMethod: recommendation.detection?.method ?? null,
          javaRequirementDetails: recommendation.detection
            ? JSON.stringify({
                minimumMajor: recommendation.minimumMajor,
                maximumMajor: recommendation.maximumMajor,
                status: recommendation.status,
                artifactSha256: recommendation.artifactSha256,
                artifactSizeBytes: recommendation.artifactSizeBytes,
                artifactCheckedAt: recommendation.artifactCheckedAt,
                indicators: recommendation.detection.indicators,
                warnings: recommendation.detection.warnings,
              })
            : null,
          javaRequirementDetectedAt: new Date(),
        },
      });
    }

    res.json({ server, recommendation, autoSelectedRuntime: server.javaRuntimeId !== existing.javaRuntimeId });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/servers/:id
serverRoutes.patch("/:id", async (req, res, next) => {
  try {
    const body = req.body as UpdateServerDto;
    optionalInt(body.ramMinMb, "ramMinMb", 128, 262144);
    optionalInt(body.ramMaxMb, "ramMaxMb", 128, 262144);
    optionalInt(body.port, "port", 1, 65535);
    validateBindAddress(body.bindAddress);
    if (body.ramMinMb && body.ramMaxMb && body.ramMinMb > body.ramMaxMb) {
      throw badRequest("ramMinMb cannot be greater than ramMaxMb");
    }
    if (body.port !== undefined) {
      await portManagerService.assertAvailableForServer(body.port, req.params.id, body.bindAddress ?? "0.0.0.0");
    }
    if (body.name !== undefined) {
      await ensureUniqueServerName(requireText(body.name, "name"), req.params.id);
    }
    const server = await prisma.server.update({
      where: { id: req.params.id },
      data: body,
    });
    if (body.path !== undefined || body.version !== undefined || body.software !== undefined) {
      await refreshJavaRequirement(server.id, server.path);
    }
    res.json({ server });
  } catch (err) {
    if (err instanceof PortConflictError) {
      next(portConflictToHttp(err));
      return;
    }
    next(err);
  }
});

serverRoutes.patch("/:id/java-runtime", async (req, res, next) => {
  try {
    const existing = await prisma.server.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    const body = req.body as AssignServerJavaRuntimeDto;
    const selection = await resolveJavaSelection({
      version: existing.version,
      software: existing.software,
      javaRuntimeId: body.javaRuntimeId,
      javaPath: body.javaPath ?? existing.javaPath,
      javaOverrideMode: body.javaOverrideMode,
      allowUnsupportedJava: body.allowUnsupportedJava,
      strict: true,
      artifactPath: path.join(existing.path, "server.jar"),
      serverId: existing.id,
    });
    const { recommendation, ...javaData } = selection;
    const server = await prisma.server.update({
      where: { id: req.params.id },
      data: {
        ...javaData,
        javaRequirementMajor: recommendation.detection?.requiredMajor ?? null,
        javaRequirementConfidence: recommendation.detection?.confidence ?? null,
        javaRequirementMethod: recommendation.detection?.method ?? null,
        javaRequirementDetails: recommendation.detection
          ? JSON.stringify({
              minimumMajor: recommendation.minimumMajor,
              maximumMajor: recommendation.maximumMajor,
              status: recommendation.status,
              artifactSha256: recommendation.artifactSha256,
              artifactSizeBytes: recommendation.artifactSizeBytes,
              artifactCheckedAt: recommendation.artifactCheckedAt,
              indicators: recommendation.detection.indicators,
              warnings: recommendation.detection.warnings,
            })
          : undefined,
        javaRequirementDetectedAt: recommendation.detection ? new Date() : undefined,
      },
    });
    res.json({ server });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/servers/:id
serverRoutes.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const server = await prisma.server.findUniqueOrThrow({ where: { id } });
    let backupCreated = false;

    if (serverManager.isRunning(id)) {
      emitDeleteProgress({
        serverId: id,
        status: "running",
        stage: "stopping-server",
        message: "Stopping the running server",
        percent: 10,
      });
      await serverManager.stop(id);
    }

    emitDeleteProgress({
      serverId: id,
      status: "running",
      stage: "creating-backup",
      message: "Creating a safety backup",
      percent: 30,
    });
    try {
      await createBackup(id, "manual");
      backupCreated = true;
    } catch (e) {
      logger.warn({ e }, "Pre-delete backup failed; continuing with delete");
    }

    emitDeleteProgress({
      serverId: id,
      status: "running",
      stage: "deleting-files",
      message: "Deleting server folder",
      percent: 60,
    });
    await fs.rm(server.path, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 250,
    });

    emitDeleteProgress({
      serverId: id,
      status: "running",
      stage: "removing-metadata",
      message: "Removing server records",
      percent: 85,
    });
    await prisma.$transaction([
      prisma.backup.deleteMany({ where: { serverId: id } }),
      prisma.server.delete({ where: { id } }),
    ]);

    emitDeleteProgress({
      serverId: id,
      status: "completed",
      stage: "done",
      message: "Server deleted",
      percent: 100,
    });
    res.json({
      message: "Server deleted",
      serverId: id,
      deletedPath: server.path,
      backupCreated,
    });
  } catch (err) {
    const id = req.params.id;
    emitDeleteProgress({
      serverId: id,
      status: "failed",
      stage: "failed",
      message: "Delete failed",
      percent: 100,
      error: err instanceof Error ? err.message : "Delete failed",
    });
    next(err);
  }
});

serverRoutes.post("/:id/start", async (req, res, next) => {
  try {
    await serverManager.start(req.params.id);
    res.json({ message: "Server starting" });
  } catch (err) {
    if (err instanceof PortConflictError) {
      next(portConflictToHttp(err));
      return;
    }
    next(err);
  }
});

serverRoutes.post("/:id/stop", async (req, res, next) => {
  try {
    await serverManager.stop(req.params.id);
    res.json({ message: "Server stopping" });
  } catch (err) {
    next(err);
  }
});

serverRoutes.post("/:id/restart", async (req, res, next) => {
  try {
    await serverManager.restart(req.params.id);
    res.json({ message: "Server restarting" });
  } catch (err) {
    if (err instanceof PortConflictError) {
      next(portConflictToHttp(err));
      return;
    }
    next(err);
  }
});

serverRoutes.get("/:id/plugins", async (req, res, next) => {
  try {
    const plugins = await pluginInstallService.listInstalled(req.params.id);
    res.json({ plugins });
  } catch (err) {
    next(err);
  }
});

serverRoutes.post("/:id/plugins/install", async (req, res, next) => {
  try {
    const body = req.body as PluginInstallRequest;
    if (!body.projectId || !body.versionId) {
      throw badRequest("projectId and versionId are required", "plugin");
    }
    const result = await pluginInstallService.install({
      serverId: req.params.id,
      projectId: body.projectId,
      versionId: body.versionId,
      allowWarning: body.allowWarning,
      dependencyMode: body.dependencyMode,
      requestId: body.requestId,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

serverRoutes.post("/:id/plugins/jobs/:jobId/cancel", async (req, res, next) => {
  try {
    const job = await pluginInstallService.cancel(req.params.jobId);
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

serverRoutes.post("/:id/plugins/:pluginId/update", async (req, res, next) => {
  try {
    const result = await pluginInstallService.updatePlugin(req.params.id, req.params.pluginId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

serverRoutes.post("/:id/plugins/:pluginId/disable", async (req, res, next) => {
  try {
    const plugin = await pluginInstallService.disable(req.params.id, req.params.pluginId);
    res.json({ plugin });
  } catch (err) {
    next(err);
  }
});

serverRoutes.post("/:id/plugins/:pluginId/enable", async (req, res, next) => {
  try {
    const plugin = await pluginInstallService.enable(req.params.id, req.params.pluginId);
    res.json({ plugin });
  } catch (err) {
    next(err);
  }
});

serverRoutes.delete("/:id/plugins/:pluginId", async (req, res, next) => {
  try {
    const result = await pluginInstallService.remove(req.params.id, req.params.pluginId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/servers/:id/command
serverRoutes.post("/:id/command", async (req, res, next) => {
  try {
    const { command } = req.body as SendCommandDto;
    if (!command?.trim()) throw badRequest("command is required");
    if (!serverManager.isRunning(req.params.id)) {
      throw new HttpError(
        409,
        "Start the server before sending console commands.",
        "server",
        "warning",
        "Console commands can only be sent while the Minecraft server process is running.",
        ["retry", "copy-details", "dismiss"]
      );
    }
    serverManager.sendCommand(req.params.id, command);
    res.json({ message: "Command sent" });
  } catch (err) {
    next(err);
  }
});

async function getFileManager(serverId: string): Promise<FileManager> {
  const server = await prisma.server.findUniqueOrThrow({
    where: { id: serverId },
  });
  return new FileManager(server.path);
}

// GET /api/servers/:id/files?path=some/dir
serverRoutes.get("/:id/files", async (req, res, next) => {
  try {
    const fm = await getFileManager(req.params.id);
    const relativePath = (req.query.path as string) ?? "";
    const entries = await fm.listDirectory(relativePath);
    res.json({ entries });
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id/files/search?query=name&path=some/dir
serverRoutes.get("/:id/files/search", async (req, res, next) => {
  try {
    const fm = await getFileManager(req.params.id);
    const query = (req.query.query as string) ?? "";
    const relativePath = (req.query.path as string) ?? "";
    const limit = Number(req.query.limit ?? 200);
    const results = await fm.search(query, relativePath, Number.isFinite(limit) ? limit : 200);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id/files/content?path=file.txt
serverRoutes.get("/:id/files/content", async (req, res, next) => {
  try {
    const fm = await getFileManager(req.params.id);
    const filePath = req.query.path as string;
    if (!filePath) throw badRequest("path query param required", "file");
    const content = await fm.readFileContent(filePath);
    res.json(content);
  } catch (err) {
    next(err);
  }
});

// PUT /api/servers/:id/files
serverRoutes.put("/:id/files", async (req, res, next) => {
  try {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: req.params.id } });
    const fm = await getFileManager(req.params.id);
    const body = req.body as WriteFileDto;
    if (!body.path) throw badRequest("path is required", "file");
    const content = await fm.writeFile(body);
    if (path.basename(body.path).toLowerCase() === "server.jar") {
      await refreshJavaRequirement(server.id, server.path);
    }
    res.json({ message: "File saved", file: content });
  } catch (err) {
    if (err instanceof FileConflictError) {
      next(
        new HttpError(
          409,
          err.message,
          "file",
          "warning",
          "Reload the file, copy your unsaved changes, or save again to overwrite the disk version."
        )
      );
      return;
    }
    next(err);
  }
});

// PUT /api/servers/:id/files/upload?path=folder/file.jar&overwrite=true
// The upload is streamed into the server sandbox; the renderer never receives filesystem access.
serverRoutes.put("/:id/files/upload", async (req, res, next) => {
  try {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: req.params.id } });
    const fm = await getFileManager(req.params.id);
    const filePath = req.query.path as string;
    if (!filePath) throw badRequest("path query param required", "file");
    if (!String(req.headers["content-type"] ?? "").startsWith("application/octet-stream")) {
      throw badRequest("Upload body must be a binary file stream.", "file");
    }
    const overwrite = req.query.overwrite === "true";
    const file = await fm.uploadFile(filePath, req, overwrite);
    if (path.basename(filePath).toLowerCase() === "server.jar") {
      await refreshJavaRequirement(server.id, server.path);
    }
    res.status(overwrite ? 200 : 201).json({ message: "File uploaded", file });
  } catch (err) {
    if (err instanceof FileExistsError) {
      next(new HttpError(409, err.message, "file", "warning", "Choose a different name or confirm replacing the existing file.", ["retry", "dismiss"]));
      return;
    }
    next(err);
  }
});

// POST /api/servers/:id/files/create
serverRoutes.post("/:id/files/create", async (req, res, next) => {
  try {
    const fm = await getFileManager(req.params.id);
    const { path: filePath, content } = req.body as CreateFileDto;
    if (!filePath) throw badRequest("path is required", "file");
    const file = await fm.createFile(filePath, content ?? "");
    res.status(201).json({ message: "File created", file });
  } catch (err) {
    next(err);
  }
});

// POST /api/servers/:id/files/folders
serverRoutes.post("/:id/files/folders", async (req, res, next) => {
  try {
    const fm = await getFileManager(req.params.id);
    const { path: folderPath } = req.body as CreateFolderDto;
    if (!folderPath) throw badRequest("path is required", "file");
    const folder = await fm.createDirectory(folderPath);
    res.status(201).json({ message: "Folder created", folder });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/servers/:id/files?path=some/file
serverRoutes.delete("/:id/files", async (req, res, next) => {
  try {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: req.params.id } });
    const fm = await getFileManager(req.params.id);
    const filePath = req.query.path as string;
    if (!filePath) throw badRequest("path query param required", "file");
    await fm.deleteEntry(filePath);
    if (path.basename(filePath).toLowerCase() === "server.jar") {
      await refreshJavaRequirement(server.id, server.path);
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/servers/:id/files/rename
serverRoutes.patch("/:id/files/rename", async (req, res, next) => {
  try {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: req.params.id } });
    const fm = await getFileManager(req.params.id);
    const { oldPath, newPath } = req.body as { oldPath: string; newPath: string };
    if (!oldPath || !newPath) throw badRequest("oldPath and newPath are required", "file");
    await fm.rename(oldPath, newPath);
    if (
      path.basename(oldPath).toLowerCase() === "server.jar" ||
      path.basename(newPath).toLowerCase() === "server.jar"
    ) {
      await refreshJavaRequirement(server.id, server.path);
    }
    res.json({ message: "Renamed" });
  } catch (err) {
    next(err);
  }
});

// POST /api/servers/:id/files/duplicate
serverRoutes.post("/:id/files/duplicate", async (req, res, next) => {
  try {
    const fm = await getFileManager(req.params.id);
    const { path: filePath, targetPath } = req.body as DuplicateFileDto;
    if (!filePath) throw badRequest("path is required", "file");
    const entry = await fm.duplicate(filePath, targetPath);
    res.status(201).json({ message: "Duplicated", entry });
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id/files/download?path=some/file
serverRoutes.get("/:id/files/download", async (req, res, next) => {
  try {
    const fm = await getFileManager(req.params.id);
    const filePath = (req.query.path as string) ?? "";
    await fm.streamDownload(filePath, res);
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id/backups
serverRoutes.get("/:id/backups", async (req, res, next) => {
  try {
    const backups = await prisma.backup.findMany({
      where: { serverId: req.params.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ backups });
  } catch (err) {
    next(err);
  }
});

// POST /api/servers/:id/backups
serverRoutes.post("/:id/backups", async (req, res, next) => {
  try {
    const backupId = await createBackup(req.params.id, "manual");
    res.status(202).json({ message: "Backup started", backupId });
  } catch (err) {
    next(err);
  }
});
