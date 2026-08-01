import { Router } from "express";
import type { ServerFramework } from "@serverlab/shared";
import { softwareProviderRegistry } from "../services/software/providers.js";
import { softwareCacheService } from "../services/software/SoftwareCacheService.js";
import { softwareDownloadService } from "../services/software/SoftwareDownloadService.js";
import { badRequest } from "../middleware/error.js";

export const softwareRoutes = Router();

function providerId(value: unknown): ServerFramework {
  if (value === "paper" || value === "purpur" || value === "fabric" || value === "spigot") {
    return value;
  }
  throw badRequest("Unknown software provider");
}

softwareRoutes.get("/providers", (_req, res, next) => {
  try {
    res.json({ providers: softwareProviderRegistry.list() });
  } catch (err) {
    next(err);
  }
});

softwareRoutes.get("/:provider/versions", async (req, res, next) => {
  try {
    const id = providerId(req.params.provider);
    const provider = softwareProviderRegistry.get(id);

    try {
      const versions = await provider.listMinecraftVersions();
      res.json({ versions, offline: false });
    } catch {
      const cachedVersions = await softwareCacheService.getCachedVersions(id);
      res.json({ versions: cachedVersions, offline: true });
    }
  } catch (err) {
    next(err);
  }
});

softwareRoutes.get("/:provider/versions/:version/builds", async (req, res, next) => {
  try {
    const id = providerId(req.params.provider);
    const provider = softwareProviderRegistry.get(id);
    const minecraftVersion = req.params.version;
    const cachedBuildIds = await softwareCacheService.getCachedBuildIds(id, minecraftVersion);

    try {
      const builds = await provider.listBuilds(minecraftVersion);
      res.json({
        builds: builds.map((build) => ({
          ...build,
          cached: cachedBuildIds.has(build.id),
        })),
        offline: false,
      });
    } catch {
      res.json({
        builds: [...cachedBuildIds].map((buildId, index) => ({
          id: buildId,
          label: `Cached build ${buildId}`,
          cached: true,
          recommended: index === 0,
        })),
        offline: true,
      });
    }
  } catch (err) {
    next(err);
  }
});

softwareRoutes.get("/cache", async (_req, res, next) => {
  try {
    const artifacts = await softwareCacheService.listArtifacts();
    res.json({ artifacts });
  } catch (err) {
    next(err);
  }
});

softwareRoutes.get("/cache/path", (_req, res, next) => {
  try {
    res.json({ path: softwareCacheService.root });
  } catch (err) {
    next(err);
  }
});

softwareRoutes.get("/cache/status", async (req, res, next) => {
  try {
    const provider = providerId(req.query.provider);
    const minecraftVersion = String(req.query.minecraftVersion ?? "");
    const buildId = String(req.query.buildId ?? "");
    if (!minecraftVersion || !buildId) {
      throw badRequest("minecraftVersion and buildId are required");
    }

    const artifact = await softwareCacheService.findValidArtifact(provider, minecraftVersion, buildId);
    res.json({ cached: Boolean(artifact), artifact });
  } catch (err) {
    next(err);
  }
});

softwareRoutes.delete("/cache/:artifactId", async (req, res, next) => {
  try {
    await softwareCacheService.removeArtifact(req.params.artifactId);
    res.json({ message: "Software artifact removed" });
  } catch (err) {
    next(err);
  }
});

softwareRoutes.post("/downloads", async (req, res, next) => {
  try {
    const provider = providerId(req.body.provider);
    const minecraftVersion = String(req.body.minecraftVersion ?? "");
    const buildId = String(req.body.buildId ?? "");
    if (!minecraftVersion || !buildId) {
      throw badRequest("provider, minecraftVersion, and buildId are required");
    }

    const result = await softwareDownloadService.ensureArtifact({
      provider,
      minecraftVersion,
      buildId,
      requestId: typeof req.body.requestId === "string" ? req.body.requestId : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

softwareRoutes.post("/downloads/:id/cancel", async (req, res, next) => {
  try {
    const download = await softwareDownloadService.cancel(req.params.id);
    res.json({ download, artifact: null, cached: false });
  } catch (err) {
    next(err);
  }
});
