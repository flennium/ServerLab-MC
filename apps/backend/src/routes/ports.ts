import { Router } from "express";
import { portManagerService } from "../services/PortManagerService.js";
import { badRequest } from "../middleware/error.js";

export const portRoutes = Router();

function parsePort(value: unknown, fallback?: number): number {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw badRequest("port is required", "network");
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw badRequest("port must be between 1 and 65535", "network");
  }
  return port;
}

portRoutes.get("/check", async (req, res, next) => {
  try {
    const status = await portManagerService.checkPort({
      port: parsePort(req.query.port),
      host: (req.query.host as string) || undefined,
      excludeServerId: (req.query.excludeServerId as string) || null,
    });
    res.json({ status });
  } catch (error) {
    next(error);
  }
});

portRoutes.get("/suggest", async (req, res, next) => {
  try {
    const port = await portManagerService.suggestPort(
      parsePort(req.query.start, 25565),
      (req.query.excludeServerId as string) || null
    );
    res.json({ port });
  } catch (error) {
    next(error);
  }
});

portRoutes.get("/status", async (_req, res, next) => {
  try {
    const ports = await portManagerService.listPortStatuses();
    res.json({ ports });
  } catch (error) {
    next(error);
  }
});
