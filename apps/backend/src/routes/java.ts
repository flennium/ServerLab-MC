import { Router } from "express";
import path from "path";
import { prisma } from "../lib/prisma.js";
import type {
  InstallJdkDto,
  JavaGuidanceResponse,
  JavaRuntimeProviderId,
  ServerSoftware,
} from "@serverlab/shared";
import { javaRuntimeProviderRegistry } from "../services/java/JavaRuntimeProviders.js";
import { javaDetectionService } from "../services/java/JavaDetectionService.js";
import { javaRuntimeRegistry } from "../services/java/JavaRuntimeRegistry.js";
import { javaRuntimeValidator } from "../services/java/JavaRuntimeValidator.js";
import { javaRecommendationService } from "../services/java/JavaRecommendationService.js";
import { javaInstallService } from "../services/java/JavaInstallService.js";
import { badRequest, HttpError } from "../middleware/error.js";

export const javaRoutes = Router();

function providerId(value: unknown): JavaRuntimeProviderId | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "adoptium" || value === "microsoft") return value;
  throw badRequest("Unknown Java runtime provider");
}

function packageType(value: unknown): "jre" | "jdk" {
  if (value === undefined || value === null || value === "") return "jre";
  if (value === "jre" || value === "jdk") return value;
  throw badRequest("packageType must be jre or jdk");
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

javaRoutes.get("/guidance", async (_req, res, next) => {
  try {
    const servers = await prisma.server.findMany({ orderBy: { name: "asc" } });
    const entries = await Promise.all(servers.map(async (server) => {
      const recommendation = await javaRecommendationService.recommend({
        minecraftVersion: server.version,
        software: server.software as ServerSoftware,
        artifactPath: path.join(server.path, "server.jar"),
        serverId: server.id,
      });
      const selectedRuntime = server.javaRuntimeId
        ? recommendation.installedRuntimes.find((runtime) => runtime.id === server.javaRuntimeId) ?? null
        : null;
      return {
        serverId: server.id,
        serverName: server.name,
        software: server.software as ServerSoftware,
        version: server.version,
        requiredMajor: recommendation.requiredMajor,
        recommendedMajor: recommendation.recommendedMajor,
        selectedRuntimeMajor: selectedRuntime?.major ?? null,
        selectedRuntimeVersion: selectedRuntime?.version ?? null,
        selectedRuntimeSource: selectedRuntime?.source ?? null,
        confidence: recommendation.confidence,
        source: recommendation.source,
        sourceUrl: recommendation.sourceUrl,
        detectionMethod: recommendation.detection?.method ?? null,
        detectionConfidence: recommendation.detection?.confidence ?? null,
        detectionStatus: recommendation.status,
        warnings: recommendation.warnings,
        checkedAt: recommendation.checkedAt,
      };
    }));
    const payload: JavaGuidanceResponse = {
      entries,
      checkedAt: new Date().toISOString(),
    };
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

javaRoutes.get("/recommendation", async (req, res, next) => {
  try {
    const minecraftVersion = String(req.query.minecraftVersion ?? "");
    const software = String(req.query.software ?? "paper") as ServerSoftware;
    if (!minecraftVersion) {
      throw badRequest("minecraftVersion is required");
    }
    const serverId = typeof req.query.serverId === "string" ? req.query.serverId : undefined;
    const server = serverId
      ? await prisma.server.findUnique({ where: { id: serverId }, select: { path: true } })
      : null;
    const recommendation = await javaRecommendationService.recommend({
      minecraftVersion,
      software,
      artifactPath: server ? path.join(server.path, "server.jar") : undefined,
      serverId,
    });
    res.json(recommendation);
  } catch (err) {
    next(err);
  }
});

javaRoutes.post("/installations", async (req, res, next) => {
  try {
    const body = req.body as InstallJdkDto;
    const major = Number(body.major);
    if (!Number.isInteger(major) || major < 8 || major > 99) {
      throw badRequest("major must be a supported Java version");
    }
    const result = await javaInstallService.install({
      major,
      provider: providerId(body.provider),
      packageType: packageType(body.packageType),
      requestId: body.requestId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

javaRoutes.get("/installations/:id", async (req, res, next) => {
  try {
    const install = await prisma.javaInstallJob.findUnique({
      where: { id: req.params.id },
    });
    if (!install) {
      throw new HttpError(404, "Java installation not found");
    }
    res.json({ install });
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
      throw new HttpError(404, "Java runtime not found");
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
    const major = Number(body.major);
    if (!Number.isInteger(major) || major < 8 || major > 25) {
      throw badRequest("major must be a supported Java version");
    }
    const result = await javaInstallService.install({
      major,
      provider: providerId(body.provider),
      packageType: packageType(body.packageType),
      requestId: body.requestId,
    });
    res.json({ message: `Java ${body.major} installed`, ...result });
  } catch (err) {
    next(err);
  }
});
