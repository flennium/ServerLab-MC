import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createBackup, restoreBackup } from "../services/BackupService.js";

export const backupRoutes = Router();

// POST /api/backups/:id/restore
backupRoutes.post("/:id/restore", async (req, res, next) => {
  try {
    await restoreBackup(req.params.id);
    res.json({ message: "Restore complete" });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/backups/:id
backupRoutes.delete("/:id", async (req, res, next) => {
  try {
    await prisma.backup.delete({ where: { id: req.params.id } });
    res.json({ message: "Backup record deleted" });
  } catch (err) {
    next(err);
  }
});
