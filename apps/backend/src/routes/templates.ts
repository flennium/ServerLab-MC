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
        id: "browser",
        label: "Template browser",
        status: "foundation",
        description:
          "Local template inventory and metadata are available for the upcoming browser UI.",
      },
      {
        id: "community-repositories",
        label: "Community repositories",
        status: "planned",
        description:
          "Remote repository feeds will be added after signed metadata and trust rules are finalized.",
      },
      {
        id: "import-export",
        label: "Import and export",
        status: "foundation",
        description: "The API shape is reserved for portable template bundles.",
      },
      {
        id: "one-click-create",
        label: "One-click creation",
        status: "planned",
        description:
          "Template-driven server creation will reuse the existing software and Java validation flow.",
      },
      {
        id: "metadata",
        label: "Template metadata",
        status: "foundation",
        description:
          "Templates can track version, author, repository, and official status.",
      },
      {
        id: "updates",
        label: "Template updates",
        status: "planned",
        description:
          "Update checks will compare installed metadata against trusted template repositories.",
      },
    ],
  };

  res.json(response);
});

templateRoutes.post("/import", (_req, res) => {
  res.status(501).json({
    error: "Template import is planned for a future beta",
  });
});

templateRoutes.get("/:id/export", (_req, res) => {
  res.status(501).json({
    error: "Template export is planned for a future beta",
  });
});

templateRoutes.post("/:id/check-updates", (_req, res) => {
  res.status(501).json({
    error: "Template update checks are planned for a future beta",
  });
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
