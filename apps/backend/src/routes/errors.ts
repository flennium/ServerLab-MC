import { Router } from "express";
import { errorService } from "../services/ErrorService.js";
import { badRequest } from "../middleware/error.js";
import type { AppErrorCreateInput } from "@serverlab/shared";

export const errorRoutes = Router();

errorRoutes.get("/", async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const includeCleared = req.query.includeCleared === "true";
    const errors = await errorService.list({ limit, includeCleared });
    res.json({ errors });
  } catch (err) {
    next(err);
  }
});

errorRoutes.post("/", async (req, res, next) => {
  try {
    const body = req.body as AppErrorCreateInput;
    if (!body?.userMessage) {
      throw badRequest("userMessage is required", "renderer");
    }
    const error = await errorService.report({
      ...body,
      source: body.source ?? "renderer",
      action: body.action ?? "renderer-report",
    });
    res.status(201).json({ error });
  } catch (err) {
    next(err);
  }
});

errorRoutes.post("/:id/clear", async (req, res, next) => {
  try {
    await errorService.clear(req.params.id);
    res.json({ message: "Error cleared" });
  } catch (err) {
    next(err);
  }
});

errorRoutes.post("/clear", async (_req, res, next) => {
  try {
    await errorService.clearAll();
    res.json({ message: "Error history cleared" });
  } catch (err) {
    next(err);
  }
});

errorRoutes.get("/export", async (_req, res, next) => {
  try {
    const errors = await errorService.list({ limit: 200, includeCleared: true });
    res.json({ exportedAt: new Date().toISOString(), errors });
  } catch (err) {
    next(err);
  }
});
