import type { Request, Response, NextFunction } from "express";
import type {
  AppErrorCategory,
  AppErrorRecoveryAction,
  AppErrorSeverity,
} from "@serverlab/shared";
import { errorService } from "../services/ErrorService.js";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly category: AppErrorCategory = "unknown",
    public readonly severity: AppErrorSeverity = "warning",
    public readonly possibleSolution: string | null = null,
    public readonly recoveries: AppErrorRecoveryAction[] = ["dismiss"]
  ) {
    super(message);
  }
}

export function badRequest(
  message: string,
  category: AppErrorCategory = "unknown",
  possibleSolution = "Review the highlighted input and try again."
): HttpError {
  return new HttpError(400, message, category, "warning", possibleSolution, [
    "copy-details",
    "dismiss",
  ]);
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  const appError = errorService.createFromUnknown(err, {
    category: err instanceof HttpError ? err.category : undefined,
    severity: err instanceof HttpError ? err.severity : statusCode >= 500 ? "error" : "warning",
    userMessage: err instanceof HttpError ? err.message : undefined,
    possibleSolution: err instanceof HttpError ? err.possibleSolution : undefined,
    recoveries: err instanceof HttpError ? err.recoveries : undefined,
    source: `backend:${req.baseUrl || req.path}`,
    action: `${req.method} ${req.originalUrl}`,
  });
  void errorService.record(appError);
  res.status(statusCode).json({ error: appError });
}
