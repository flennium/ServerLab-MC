import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  if (statusCode < 500) {
    res.status(statusCode).json({ error: err.message });
    return;
  }

  logger.error({ err }, "Unhandled error");
  res.status(statusCode).json({
    error: "Internal server error",
    details: process.env.NODE_ENV !== "production" ? err.message : undefined,
  });
}
