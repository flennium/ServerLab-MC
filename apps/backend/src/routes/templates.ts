import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const templateRoutes = Router();

// GET /api/templates
templateRoutes.get("/", async (_req, res, next) => {
  try {
    const templates = await prisma.template.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

// POST /api/templates/:id/install
// Full GitHub download + extract logic lives in TemplateInstaller (v3)
templateRoutes.post("/:id/install", async (req, res, next) => {
  try {
    const template = await prisma.template.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    // TODO: kick off TemplateInstaller and stream progress via Socket.IO
    res.status(202).json({ message: "Template install queued", template });
  } catch (err) {
    next(err);
  }
});
