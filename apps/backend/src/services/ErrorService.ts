import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import type {
  AppError,
  AppErrorCategory,
  AppErrorCreateInput,
  AppErrorEvent,
  AppErrorRecoveryAction,
  AppErrorSeverity,
} from "@serverlab/shared";

const TOKEN_PATTERN = /(bearer\s+)[a-z0-9._~+/=-]+/gi;
const WINDOWS_USER_PATTERN = /C:\\Users\\([^\\\s]+)/gi;

function nowIso(): string {
  return new Date().toISOString();
}

function redact(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(TOKEN_PATTERN, "$1[redacted]")
    .replace(WINDOWS_USER_PATTERN, "C:\\Users\\[redacted]");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export function isAppError(value: unknown): value is AppError {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as AppError).id === "string" &&
    typeof (value as AppError).userMessage === "string" &&
    Array.isArray((value as AppError).recoveries)
  );
}

function recoveriesFor(category: AppErrorCategory): AppErrorRecoveryAction[] {
  if (category === "java") return ["open-java-center", "copy-details", "dismiss"];
  if (category === "download") return ["retry", "open-settings", "copy-details", "dismiss"];
  if (category === "file") return ["open-settings", "copy-details", "dismiss"];
  if (category === "server") return ["retry", "copy-details", "dismiss"];
  if (category === "auth" || category === "network")
    return ["retry", "open-logs", "copy-details", "dismiss"];
  return ["copy-details", "dismiss"];
}

function mapCategory(message: string, source?: string): AppErrorCategory {
  const text = `${source ?? ""} ${message}`.toLowerCase();
  if (text.includes("java")) return "java";
  if (text.includes("download") || text.includes("cache")) return "download";
  if (text.includes("plugin") || text.includes("modrinth")) return "plugin";
  if (text.includes("update") || text.includes("updater")) return "update";
  if (text.includes("config") || text.includes("eula")) return "config";
  if (text.includes("port") || text.includes("bind") || text.includes("address already in use")) {
    return "network";
  }
  if (text.includes("file") || text.includes("path") || text.includes("folder"))
    return "file";
  if (text.includes("server")) return "server";
  if (text.includes("template")) return "template";
  if (text.includes("unauthorized") || text.includes("auth")) return "auth";
  if (text.includes("network") || text.includes("fetch")) return "network";
  return "unknown";
}

export function createAppError(input: AppErrorCreateInput): AppError {
  return {
    id: crypto.randomUUID(),
    category: input.category ?? "unknown",
    severity: input.severity ?? "error",
    userMessage: input.userMessage,
    technicalDetails: redact(input.technicalDetails),
    possibleSolution: input.possibleSolution ?? null,
    timestamp: nowIso(),
    source: input.source ?? "backend",
    action: input.action ?? "unknown",
    causeId: input.causeId ?? null,
    recoveries: input.recoveries ?? recoveriesFor(input.category ?? "unknown"),
  };
}

function toEvent(record: {
  id: string;
  category: string;
  severity: string;
  userMessage: string;
  technicalDetails: string | null;
  possibleSolution: string | null;
  action: string;
  source: string;
  recoveriesJson: string;
  createdAt: Date;
  clearedAt: Date | null;
}): AppErrorEvent {
  return {
    id: record.id,
    category: record.category as AppErrorCategory,
    severity: record.severity as AppErrorSeverity,
    userMessage: record.userMessage,
    technicalDetails: record.technicalDetails,
    possibleSolution: record.possibleSolution,
    timestamp: record.createdAt.toISOString(),
    source: record.source,
    action: record.action,
    causeId: null,
    recoveries: JSON.parse(record.recoveriesJson || "[]") as AppErrorRecoveryAction[],
    clearedAt: record.clearedAt ? record.clearedAt.toISOString() : null,
  };
}

export class ErrorService {
  createFromUnknown(
    error: unknown,
    input: Partial<AppErrorCreateInput> = {}
  ): AppError {
    if (isAppError(error)) return error;
    const message = errorMessage(error);
    const category = input.category ?? mapCategory(message, input.source);
    const isProduction = process.env.NODE_ENV === "production";
    const severity = input.severity ?? (category === "unknown" ? "error" : "warning");
    return createAppError({
      category,
      severity,
      userMessage:
        input.userMessage ??
        (isProduction && severity !== "warning" ? "Something went wrong." : message),
      technicalDetails:
        input.technicalDetails ??
        (error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : message),
      possibleSolution:
        input.possibleSolution ?? "Try the action again. If it keeps failing, copy the error details.",
      source: input.source ?? "backend",
      action: input.action ?? "unknown",
      recoveries: input.recoveries ?? recoveriesFor(category),
    });
  }

  async record(error: AppError): Promise<AppError> {
    logger[error.severity === "critical" || error.severity === "error" ? "error" : "warn"](
      { error },
      "Application error"
    );
    await prisma.errorEvent
      .create({
        data: {
          id: error.id,
          category: error.category,
          severity: error.severity,
          userMessage: error.userMessage,
          technicalDetails: error.technicalDetails,
          possibleSolution: error.possibleSolution,
          action: error.action,
          source: error.source,
          recoveriesJson: JSON.stringify(error.recoveries),
          createdAt: new Date(error.timestamp),
        },
      })
      .catch(() => {});
    return error;
  }

  async report(input: AppErrorCreateInput): Promise<AppError> {
    return this.record(createAppError(input));
  }

  async list(options: {
    limit?: number;
    includeCleared?: boolean;
  } = {}): Promise<AppErrorEvent[]> {
    const rows = await prisma.errorEvent.findMany({
      where: options.includeCleared ? undefined : { clearedAt: null },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(options.limit ?? 50, 1), 200),
    });
    return rows.map(toEvent);
  }

  async clear(id: string): Promise<void> {
    await prisma.errorEvent
      .update({ where: { id }, data: { clearedAt: new Date() } })
      .catch(() => {});
  }

  async clearAll(): Promise<void> {
    await prisma.errorEvent.updateMany({
      where: { clearedAt: null },
      data: { clearedAt: new Date() },
    });
  }
}

export const errorService = new ErrorService();
