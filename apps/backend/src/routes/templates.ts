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

templateRoutes.post("/:id/install", async (_req, res, next) => {
  try {
    res.status(501).json({
      error: "Template installation is not available in this beta",
    });
  } catch (err) {
    next(err);
  }
});
