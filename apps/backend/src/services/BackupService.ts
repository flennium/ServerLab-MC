import fsPromises from "fs/promises";
import path from "path";
import archiver from "archiver";
import { createWriteStream } from "fs";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { io } from "../index.js";

/**
 * Backups are stored in DATA_DIR/backups/ (injected by Electron main).
 * Falls back to <cwd>/backups/ for standalone dev without Electron.
 */
function getBackupsRoot(): string {
  const dataDir = process.env.DATA_DIR;
  if (dataDir) return path.join(dataDir, "backups");
  return path.join(process.cwd(), "backups");
}

export async function createBackup(
  serverId: string,
  type: "manual" | "scheduled" = "manual"
): Promise<string> {
  const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });

  const BACKUPS_ROOT = getBackupsRoot();
  await fsPromises.mkdir(BACKUPS_ROOT, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${server.name.replace(/\s+/g, "_")}_${timestamp}.zip`;
  const dest = path.join(BACKUPS_ROOT, filename);

  logger.info({ serverId, dest }, "Starting backup");

  const backupId = crypto.randomUUID();

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(dest);
    const archive = archiver("zip", { zlib: { level: 6 } });

    let totalBytes = 0;

    archive.on("progress", (prog) => {
      totalBytes = prog.fs.totalBytes;
      const processed = prog.fs.processedBytes;
      const percent =
        totalBytes > 0 ? Math.round((processed / totalBytes) * 100) : 0;
      io.emit("backup:progress", { backupId, percent });
    });

    output.on("close", () => resolve());
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(server.path, false);
    archive.finalize();
  });

  const stat = await fsPromises.stat(dest);

  const backup = await prisma.backup.create({
    data: {
      id: backupId,
      serverId,
      location: dest,
      sizeBytes: stat.size,
      type,
    },
  });

  io.emit("backup:progress", { backupId, percent: 100 });
  logger.info({ backupId, sizeBytes: stat.size }, "Backup complete");

  return backup.id;
}

export async function restoreBackup(backupId: string): Promise<void> {
  const backup = await prisma.backup.findUniqueOrThrow({
    where: { id: backupId },
    include: { server: true },
  });

  // Auto-backup the current state before overwriting
  await createBackup(backup.serverId, "manual");

  const extractZip = (await import("extract-zip")).default;

  // Clear the server directory first (keep the directory itself)
  const entries = await fsPromises.readdir(backup.server.path);
  await Promise.all(
    entries.map((e) =>
      fsPromises.rm(path.join(backup.server.path, e), {
        recursive: true,
        force: true,
      })
    )
  );

  await extractZip(backup.location, { dir: path.resolve(backup.server.path) });
  logger.info({ backupId }, "Restore complete");
}
