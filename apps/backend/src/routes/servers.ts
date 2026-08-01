import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serverManager } from "../services/ServerManager.js";
import { FileManager } from "../services/FileManager.js";
import { createBackup } from "../services/BackupService.js";
import { softwareDownloadService } from "../services/software/SoftwareDownloadService.js";
import { serverSoftwareInstaller } from "../services/software/ServerSoftwareInstaller.js";
import { javaRuntimeRegistry } from "../services/java/JavaRuntimeRegistry.js";
import { javaRuntimeValidator } from "../services/java/JavaRuntimeValidator.js";
import { javaRecommendationService } from "../services/java/JavaRecommendationService.js";
import { logger } from "../lib/logger.js";
import type {
  AssignServerJavaRuntimeDto,
  CreateServerDto,
  UpdateServerDto,
  SendCommandDto,
  WriteFileDto,
} from "@serverlab/shared";

export const serverRoutes = Router();

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
  const javaOverrideMode = input.javaOverrideMode ?? (input.javaRuntimeId ? "automatic" : "manual");
  const allowUnsupportedJava = input.allowUnsupportedJava ?? false;

  if (javaOverrideMode === "manual") {
    await javaRuntimeValidator.validateExecutable(input.javaPath);
    return {
      javaRuntimeId: null,
      javaPath: input.javaPath,
      javaOverrideMode,
      allowUnsupportedJava,
    };
  }

  let runtime = input.javaRuntimeId ? await javaRuntimeRegistry.getRuntime(input.javaRuntimeId) : null;
  const recommendation = await javaRecommendationService.recommend({
    minecraftVersion: input.version,
    software: input.software,
  });
  if (!runtime) runtime = recommendation.compatibleRuntime;
  if (!runtime) {
    if (input.strict) {
      throw new Error(`Java ${recommendation.requiredMajor} is required. Install or select a compatible runtime.`);
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
    throw new Error(`Selected Java runtime is not compatible. Java ${recommendation.requiredMajor} is required.`);
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
    let version = body.version;
    let software = body.software;

    if (body.softwareSource) {
      if (!body.eulaAccepted) {
        res.status(400).json({ error: "Minecraft EULA acceptance is required" });
        return;
      }

      const requestId = body.softwareSource.requestId;
      const { artifact } = await softwareDownloadService.ensureArtifact({
        provider: body.softwareSource.provider,
        minecraftVersion: body.softwareSource.minecraftVersion,
        buildId: body.softwareSource.buildId,
        requestId,
      });
      if (requestId) await softwareDownloadService.markStage(requestId, "installing-server-files");
      await serverSoftwareInstaller.install({
        artifact,
        serverPath: body.path,
        eulaAccepted: body.eulaAccepted,
      });
      if (requestId) {
        await softwareDownloadService.markStage(requestId, "writing-eula");
        await softwareDownloadService.markStage(requestId, "done");
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
    const existing = await prisma.server.findUniqueOrThrow({ where: { id: req.params.id } });
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
    if (serverManager.isRunning(id)) {
      await serverManager.stop(id);
    }
    // Auto-backup before destroy
    await createBackup(id, "manual").catch((e) =>
      logger.warn({ e }, "Pre-delete backup failed — continuing with delete")
    );
    await prisma.server.delete({ where: { id } });
    res.json({ message: "Server deleted" });
  } catch (err) {
    next(err);
  }
});

// ─── Process control ──────────────────────────────────────────────────────────

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
    serverManager.sendCommand(req.params.id, command);
    res.json({ message: "Command sent" });
  } catch (err) {
    next(err);
  }
});

// ─── File manager ─────────────────────────────────────────────────────────────

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
    if (!filePath) {
      res.status(400).json({ error: "path query param required" });
      return;
    }
    const content = await fm.readFile(filePath);
    res.json({ path: filePath, content });
  } catch (err) {
    next(err);
  }
});

// PUT /api/servers/:id/files
serverRoutes.put("/:id/files", async (req, res, next) => {
  try {
    const fm = await getFileManager(req.params.id);
    const { path: filePath, content } = req.body as WriteFileDto;
    await fm.writeFile(filePath, content);
    res.json({ message: "File saved" });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/servers/:id/files?path=some/file
serverRoutes.delete("/:id/files", async (req, res, next) => {
  try {
    const fm = await getFileManager(req.params.id);
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ error: "path query param required" });
      return;
    }
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
    if (!oldPath || !newPath) {
      res.status(400).json({ error: "oldPath and newPath are required" });
      return;
    }
    await fm.rename(oldPath, newPath);
    res.json({ message: "Renamed" });
  } catch (err) {
    next(err);
  }
});

// ─── Backups ──────────────────────────────────────────────────────────────────

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
