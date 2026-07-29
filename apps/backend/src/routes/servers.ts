import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serverManager } from "../services/ServerManager.js";
import { FileManager } from "../services/FileManager.js";
import { createBackup } from "../services/BackupService.js";
import { logger } from "../lib/logger.js";
import type {
  CreateServerDto,
  UpdateServerDto,
  SendCommandDto,
  WriteFileDto,
} from "@serverlab/shared";

export const serverRoutes = Router();

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
    const server = await prisma.server.create({
      data: {
        name: body.name,
        path: body.path,
        version: body.version,
        software: body.software,
        javaPath: body.javaPath,
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
