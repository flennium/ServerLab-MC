import { Router } from "express";
import type { TemplateCapabilityResponse } from "@serverlab/shared";
import { prisma } from "../lib/prisma.js";

export const templateRoutes = Router();

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

templateRoutes.get("/capabilities", (_req, res) => {
  const response: TemplateCapabilityResponse = {
    importFormats: ["serverlab-template.json"],
    exportFormats: ["serverlab-template.json"],
    capabilities: [
      {
        id: "import-export",
        label: "Import and export",
        status: "foundation",
        description:
          "Portable template bundles with validation and metadata preservation.",
        details: [
          "Export templates",
          "Import templates",
          "Validate bundles",
          "Preserve metadata",
        ],
      },
      {
        id: "one-click-create",
        label: "One-click creation",
        status: "planned",
        description:
          "Template-driven server creation will reuse the existing software and Java validation flow.",
        details: [
          "Template selection",
          "Software validation",
          "Java validation",
          "Server creation",
          "Ready to start",
        ],
      },
      {
        id: "modrinth-integration",
        label: "Modrinth integration",
        status: "planned",
        description: "Native Modrinth integration for Minecraft server content.",
        details: [
          "Search Modrinth directly from ServerLab MC",
          "Install plugins, mods, datapacks, and modpacks",
          "Detect Minecraft version compatibility",
          "Manage installed content and updates",
          "View dependencies for Paper, Fabric, and Forge content",
        ],
      },
      {
        id: "backup-restore-rewrite",
        label: "Server backup and restore rewrite",
        status: "planned",
        description: "A complete backup management system for release-grade recovery.",
        details: [
          "Manual and scheduled backups",
          "Backup before updates",
          "Backup browser",
          "Restore previous versions",
          "Compression and size management",
        ],
      },
    ],
  };

  res.json(response);
});

templateRoutes.post("/import", (_req, res) => {
  res.status(501).json({
    error: "Template import is planned for a future release",
  });
});

templateRoutes.get("/:id/export", (_req, res) => {
  res.status(501).json({
    error: "Template export is planned for a future release",
  });
});

templateRoutes.post("/:id/check-updates", (_req, res) => {
  res.status(501).json({
    error: "Template update checks are planned for a future release",
  });
});

templateRoutes.post("/:id/install", async (_req, res, next) => {
  try {
    res.status(501).json({
    error: "Template installation is not available in this release",
    });
  } catch (err) {
    next(err);
  }
});
