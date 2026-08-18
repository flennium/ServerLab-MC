import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { badRequest } from "../middleware/error.js";
import { modrinthClient } from "../services/plugins/ModrinthClient.js";
import { pluginCompatibilityService } from "../services/plugins/PluginCompatibilityService.js";
import type {
  ModrinthProjectResponse,
  ModrinthSearchResponse,
  ModrinthVersionListResponse,
} from "@serverlab/shared";

export const modrinthRoutes = Router();

async function getServerContext(serverId: unknown) {
  if (typeof serverId !== "string" || !serverId) return null;
  return prisma.server.findUnique({ where: { id: serverId } });
}

modrinthRoutes.get("/search", async (req, res, next) => {
  try {
    const server = await getServerContext(req.query.serverId);
    const response = await modrinthClient.search({
      query: String(req.query.query ?? ""),
      loader: typeof req.query.loader === "string" ? req.query.loader : server?.software,
      minecraftVersion:
        typeof req.query.minecraftVersion === "string"
          ? req.query.minecraftVersion
          : server?.version,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      strictCompatibility: req.query.strictCompatibility === "true",
      sort: typeof req.query.sort === "string" ? req.query.sort : "relevance",
      offset: Number(req.query.offset ?? 0),
      limit: Number(req.query.limit ?? 20),
    });
    const payload: ModrinthSearchResponse = {
      ...response,
      hits: response.hits.map((hit) =>
        pluginCompatibilityService.withProjectCompatibility(server, hit)
      ),
    };
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

modrinthRoutes.get("/projects/:id", async (req, res, next) => {
  try {
    if (!req.params.id) throw badRequest("project id is required", "plugin");
    const server = await getServerContext(req.query.serverId);
    const { project } = await modrinthClient.getProject(req.params.id);
    const payload: ModrinthProjectResponse = {
      project: pluginCompatibilityService.withProjectCompatibility(server, project),
    };
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

modrinthRoutes.get("/projects/:id/versions", async (req, res, next) => {
  try {
    if (!req.params.id) throw badRequest("project id is required", "plugin");
    const server = await getServerContext(req.query.serverId);
    const { versions, offline } = await modrinthClient.listVersions(req.params.id);
    const dependencyIds = versions.flatMap((version) =>
      version.dependencies
        .map((dependency) => dependency.projectId)
        .filter((projectId): projectId is string => Boolean(projectId))
    );
    const dependencyNames = await modrinthClient.getProjectNames(dependencyIds).catch(() => new Map<string, string>());
    const payload: ModrinthVersionListResponse = {
      versions: versions.map((version) =>
        pluginCompatibilityService.withVersionCompatibility(server, {
          ...version,
          dependencies: version.dependencies.map((dependency) => ({
            ...dependency,
            projectName: dependency.projectId ? dependencyNames.get(dependency.projectId) ?? null : null,
          })),
        })
      ),
      offline,
    };
    res.json(payload);
  } catch (err) {
    next(err);
  }
});
