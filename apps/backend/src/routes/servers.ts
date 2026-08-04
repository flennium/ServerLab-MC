import { Router } from "express";
import fs from "fs/promises";
import { prisma } from "../lib/prisma.js";
import { serverManager } from "../services/ServerManager.js";
import { FileConflictError, FileManager } from "../services/FileManager.js";
import { createBackup } from "../services/BackupService.js";
import { softwareDownloadService } from "../services/software/SoftwareDownloadService.js";
import { serverSoftwareInstaller } from "../services/software/ServerSoftwareInstaller.js";
import { javaRuntimeRegistry } from "../services/java/JavaRuntimeRegistry.js";
import { javaRuntimeValidator } from "../services/java/JavaRuntimeValidator.js";
import { javaRecommendationService } from "../services/java/JavaRecommendationService.js";
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
  ServerDeleteProgressPayload,
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

function validateCreateServer(body: CreateServerDto): void {
  requireText(body.name, "name");
  requireText(body.path, "path");
  requireText(body.version, "version");
  requireText(body.software, "software");
  if (!body.softwareSource) requireText(body.javaPath, "javaPath");
  optionalInt(body.ramMinMb, "ramMinMb", 128, 262144);
  optionalInt(body.ramMaxMb, "ramMaxMb", 128, 262144);
  optionalInt(body.port, "port", 1, 65535);
  if (body.ramMinMb && body.ramMaxMb && body.ramMinMb > body.ramMaxMb) {
    throw badRequest("ramMinMb cannot be greater than ramMaxMb");
  }
}

async function resolveJavaSelection(input: {
  version: string;
  software: string;
  javaRuntimeId?: string | null;
  javaPath: string;
  javaOverrideMode?: string;
  allowUnsupportedJava?: boolean;
  strict: boolean;
}): Promise<{
  javaRuntimeId: string | null;
  javaPath: string;
  javaOverrideMode: string;
  allowUnsupportedJava: boolean;
}> {
  const javaOverrideMode =
    input.javaOverrideMode ?? (input.javaRuntimeId ? "automatic" : "manual");
  const allowUnsupportedJava = input.allowUnsupportedJava ?? false;

  if (javaOverrideMode === "manual") {
    try {
      await javaRuntimeValidator.validateExecutable(input.javaPath);
    } catch (error) {
      throw badRequest(
        error instanceof Error
          ? error.message
          : "Java executable could not be validated"
      );
    }
    return {
      javaRuntimeId: null,
      javaPath: input.javaPath,
      javaOverrideMode,
      allowUnsupportedJava,
    };
  }

  let runtime = input.javaRuntimeId
    ? await javaRuntimeRegistry.getRuntime(input.javaRuntimeId)
    : null;
  const recommendation = await javaRecommendationService.recommend({
    minecraftVersion: input.version,
    software: input.software,
  });
  if (!runtime) runtime = recommendation.compatibleRuntime;
  if (!runtime) {
    if (input.strict) {
      throw badRequest(
        `Java ${recommendation.requiredMajor} is required. Install or select a compatible runtime.`
      );
    }
    return {
      javaRuntimeId: null,
      javaPath: input.javaPath,
      javaOverrideMode: "manual",
      allowUnsupportedJava,
    };
  }

  const validated = await javaRuntimeValidator.validateRuntime(runtime);
  if (
    validated.status !== "valid" ||
    !javaRecommendationService.isCompatible(
      validated.major,
      recommendation.requiredMajor,
      allowUnsupportedJava
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
  };
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
    let version = body.version;
    let software = body.software;

    if (body.softwareSource) {
      if (!body.eulaAccepted) {
        throw badRequest("Minecraft EULA acceptance is required");
      }
      version = body.softwareSource.minecraftVersion;
      software = body.softwareSource.provider;
    }

    const javaSelection = await resolveJavaSelection({
      version,
      software,
      javaRuntimeId: body.javaRuntimeId,
      javaPath: body.javaPath,
      javaOverrideMode: body.javaOverrideMode,
      allowUnsupportedJava: body.allowUnsupportedJava,
      strict: Boolean(body.softwareSource),
    });

    if (body.softwareSource) {
      const requestId = body.softwareSource.requestId;
      const { artifact } = await softwareDownloadService.ensureArtifact({
        provider: body.softwareSource.provider,
        minecraftVersion: body.softwareSource.minecraftVersion,
        buildId: body.softwareSource.buildId,
        requestId,
      });
      if (requestId)
        await softwareDownloadService.markStage(requestId, "installing-server-files");
      await serverSoftwareInstaller.install({
        artifact,
        serverPath: body.path,
        eulaAccepted: body.eulaAccepted === true,
      });
      if (requestId) {
        await softwareDownloadService.markStage(requestId, "writing-eula");
        await softwareDownloadService.markStage(requestId, "done");
      }
    }

    const server = await prisma.server.create({
      data: {
        name: body.name,
        path: body.path,
        version,
        software,
        javaPath: javaSelection.javaPath,
        javaRuntimeId: javaSelection.javaRuntimeId,
        javaOverrideMode: javaSelection.javaOverrideMode,
        allowUnsupportedJava: javaSelection.allowUnsupportedJava,
        ramMinMb: body.ramMinMb ?? 1024,
        ramMaxMb: body.ramMaxMb ?? 4096,
        port: body.port ?? 25565,
        startupArgs: body.startupArgs ?? null,
        autoStart: body.autoStart ?? false,
      },
    });
    res.status(201).json({ server });
  } catch (err) {
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

// PATCH /api/servers/:id
serverRoutes.patch("/:id", async (req, res, next) => {
  try {
    const body = req.body as UpdateServerDto;
    optionalInt(body.ramMinMb, "ramMinMb", 128, 262144);
    optionalInt(body.ramMaxMb, "ramMaxMb", 128, 262144);
    optionalInt(body.port, "port", 1, 65535);
    if (body.ramMinMb && body.ramMaxMb && body.ramMinMb > body.ramMaxMb) {
      throw badRequest("ramMinMb cannot be greater than ramMaxMb");
    }
    const server = await prisma.server.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json({ server });
  } catch (err) {
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
    });
    const server = await prisma.server.update({
      where: { id: req.params.id },
      data: selection,
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
    next(err);
  }
});

// POST /api/servers/:id/command
serverRoutes.post("/:id/command", async (req, res, next) => {
  try {
    const { command } = req.body as SendCommandDto;
    if (!command?.trim()) throw badRequest("command is required");
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
    const fm = await getFileManager(req.params.id);
    const body = req.body as WriteFileDto;
    if (!body.path) throw badRequest("path is required", "file");
    const content = await fm.writeFile(body);
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
    const fm = await getFileManager(req.params.id);
    const filePath = req.query.path as string;
    if (!filePath) throw badRequest("path query param required", "file");
    await fm.deleteEntry(filePath);
    res.json({ message: "Deleted" });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/servers/:id/files/rename
serverRoutes.patch("/:id/files/rename", async (req, res, next) => {
  try {
    const fm = await getFileManager(req.params.id);
    const { oldPath, newPath } = req.body as { oldPath: string; newPath: string };
    if (!oldPath || !newPath) throw badRequest("oldPath and newPath are required", "file");
    await fm.rename(oldPath, newPath);
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
