import { Router } from "express";
import type { ServerFramework } from "@serverlab/shared";
import { softwareProviderRegistry } from "../services/software/providers.js";
import { softwareCacheService } from "../services/software/SoftwareCacheService.js";
import { softwareDownloadService } from "../services/software/SoftwareDownloadService.js";
import { spigotBuildService } from "../services/software/SpigotBuildService.js";
import { badRequest, HttpError } from "../middleware/error.js";

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

softwareRoutes.get("/spigot/revisions", async (_req, res, next) => {
  try {
    const provider = softwareProviderRegistry.get("spigot");
    const versions = await provider.listMinecraftVersions();
    res.json({ versions, offline: false });
  } catch (err) {
    try {
      const versions = await softwareCacheService.getCachedVersions("spigot");
      res.json({ versions, offline: true });
    } catch (fallbackError) {
      next(fallbackError ?? err);
    }
  }
});

softwareRoutes.get("/spigot/preflight", async (req, res, next) => {
  try {
    const minecraftVersion = String(req.query.minecraftVersion ?? "");
    if (!minecraftVersion) throw badRequest("minecraftVersion is required");
    const preflight = await spigotBuildService.preflight({
      provider: "spigot",
      minecraftVersion,
      javaRuntimeId: typeof req.query.javaRuntimeId === "string" ? req.query.javaRuntimeId : undefined,
    });
    res.json({ preflight });
  } catch (err) {
    next(err);
  }
});

softwareRoutes.get("/buildtools/status", async (_req, res, next) => {
  try {
    res.json(await spigotBuildService.getBuildToolsStatus());
  } catch (err) {
    next(err);
  }
});

softwareRoutes.post("/buildtools/refresh", async (_req, res, next) => {
  try {
    await spigotBuildService.refreshBuildTools();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

softwareRoutes.post("/builds", async (req, res, next) => {
  try {
    const minecraftVersion = String(req.body.minecraftVersion ?? "");
    if (req.body.provider !== "spigot" || !minecraftVersion) {
      throw badRequest("Spigot and minecraftVersion are required", "download");
    }
    const result = await spigotBuildService.start({
      provider: "spigot",
      minecraftVersion,
      javaRuntimeId: typeof req.body.javaRuntimeId === "string" ? req.body.javaRuntimeId : undefined,
      requestId: typeof req.body.requestId === "string" ? req.body.requestId : undefined,
    });
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

softwareRoutes.get("/builds/:id", async (req, res, next) => {
  try {
    const job = await spigotBuildService.getJob(req.params.id);
    if (!job) throw new HttpError(404, "Software build job not found", "download");
    const artifact = job.status === "completed"
      ? await softwareCacheService.findValidArtifact("spigot", job.minecraftVersion, job.buildId)
      : null;
    res.json({ job, artifact, cached: Boolean(artifact) });
  } catch (err) {
    next(err);
  }
});

softwareRoutes.get("/builds/:id/log", async (req, res, next) => {
  try {
    const log = await spigotBuildService.getLog(req.params.id);
    if (!log) throw new HttpError(404, "Software build job not found", "download");
    res.json(log);
  } catch (err) {
    next(err);
  }
});

softwareRoutes.post("/builds/:id/cancel", async (req, res, next) => {
  try {
    res.json({ job: await spigotBuildService.cancel(req.params.id) });
  } catch (err) {
    next(err);
  }
});

softwareRoutes.post("/builds/:id/retry", async (req, res, next) => {
  try {
    const minecraftVersion = String(req.body.minecraftVersion ?? "");
    if (!minecraftVersion) throw badRequest("minecraftVersion is required", "download");
    res.status(202).json(await spigotBuildService.retry(req.params.id, {
      provider: "spigot",
      minecraftVersion,
      javaRuntimeId: typeof req.body.javaRuntimeId === "string" ? req.body.javaRuntimeId : undefined,
    }));
  } catch (err) {
    next(err);
  }
});

softwareRoutes.get("/downloads/:id", async (req, res, next) => {
  try {
    const download = await softwareDownloadService.getDownload(req.params.id);
    if (!download) {
      throw new HttpError(404, "Software download not found");
    }
    res.json({ download });
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
