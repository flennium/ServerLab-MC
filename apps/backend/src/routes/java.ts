import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import type { InstallJdkDto, JavaRuntimeProviderId, ServerSoftware } from "@serverlab/shared";
import { javaRuntimeProviderRegistry } from "../services/java/JavaRuntimeProviders.js";
import { javaDetectionService } from "../services/java/JavaDetectionService.js";
import { javaRuntimeRegistry } from "../services/java/JavaRuntimeRegistry.js";
import { javaRuntimeValidator } from "../services/java/JavaRuntimeValidator.js";
import { javaRecommendationService } from "../services/java/JavaRecommendationService.js";
import { javaInstallService } from "../services/java/JavaInstallService.js";

export const javaRoutes = Router();

function providerId(value: unknown): JavaRuntimeProviderId | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "adoptium" || value === "microsoft") return value;
  throw new Error("Unknown Java runtime provider");
}

javaRoutes.get("/", async (_req, res, next) => {
  try {
    const versions = await prisma.javaVersion.findMany({ orderBy: { major: "asc" } });
    res.json({ versions });
  } catch (err) {
    next(err);
  }
});

javaRoutes.get("/providers", (_req, res, next) => {
  try {
    res.json({ providers: javaRuntimeProviderRegistry.list() });
  } catch (err) {
    next(err);
  }
});

javaRoutes.get("/runtimes", async (_req, res, next) => {
  try {
    const runtimes = await javaRuntimeRegistry.listRuntimes();
    res.json({ runtimes });
  } catch (err) {
    next(err);
  }
});

javaRoutes.post("/detect", async (_req, res, next) => {
  try {
    await javaDetectionService.detect();
    const [versions, runtimes] = await Promise.all([
      prisma.javaVersion.findMany({ orderBy: { major: "asc" } }),
      javaRuntimeRegistry.listRuntimes(),
    ]);
    res.json({ versions, runtimes });
  } catch (err) {
    next(err);
  }
});

javaRoutes.get("/recommendation", async (req, res, next) => {
  try {
    const minecraftVersion = String(req.query.minecraftVersion ?? "");
    const software = String(req.query.software ?? "paper") as ServerSoftware;
    if (!minecraftVersion) {
      res.status(400).json({ error: "minecraftVersion is required" });
      return;
    }
    const recommendation = await javaRecommendationService.recommend({
      minecraftVersion,
      software,
    });
    res.json(recommendation);
  } catch (err) {
    next(err);
  }
});

javaRoutes.post("/installations", async (req, res, next) => {
  try {
    const body = req.body as InstallJdkDto;
    if (!body.major || !Number.isFinite(Number(body.major))) {
      res.status(400).json({ error: "major is required" });
      return;
    }
    const result = await javaInstallService.install({
      major: Number(body.major),
      provider: providerId(body.provider),
      packageType: body.packageType ?? "jre",
      requestId: body.requestId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

javaRoutes.post("/installations/:id/cancel", async (req, res, next) => {
  try {
    const install = await javaInstallService.cancel(req.params.id);
    res.json({ install, runtime: null });
  } catch (err) {
    next(err);
  }
});

javaRoutes.post("/runtimes/:id/validate", async (req, res, next) => {
  try {
    const runtime = await javaRuntimeRegistry.getRuntime(req.params.id);
    if (!runtime) {
      res.status(404).json({ error: "Java runtime not found" });
      return;
    }
    const validated = await javaRuntimeValidator.validateRuntime(runtime);
    res.json({ runtime: validated });
  } catch (err) {
    next(err);
  }
});

javaRoutes.delete("/runtimes/:id", async (req, res, next) => {
  try {
    await javaRuntimeRegistry.removeRuntime(req.params.id);
    res.json({ message: "Java runtime removed" });
  } catch (err) {
    next(err);
  }
});

javaRoutes.post("/install", async (req, res, next) => {
  try {
    const body = req.body as InstallJdkDto;
    const result = await javaInstallService.install({
      major: Number(body.major),
      provider: providerId(body.provider),
      packageType: body.packageType ?? "jre",
      requestId: body.requestId,
    });
    res.json({ message: `Java ${body.major} installed`, ...result });
  } catch (err) {
    next(err);
  }
});
