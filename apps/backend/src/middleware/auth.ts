import type { Request, Response, NextFunction } from "express";

const BACKEND_TOKEN = process.env.BACKEND_TOKEN;

/**
 * Validates the startup token shared between Electron main and the renderer.
 * Unauthenticated requests from other local processes are rejected.
 * The /health route is exempted so Electron can poll readiness.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.path === "/health") {
    return next();
  }

  // Standalone backend development can run without Electron's startup token.
  if (!BACKEND_TOKEN) {
    return next();
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (token !== BACKEND_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
