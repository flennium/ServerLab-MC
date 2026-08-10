import type {
  AppError,
  AppErrorCategory,
  AppErrorCreateInput,
  AppErrorRecoveryAction,
} from "@serverlab/shared";

type Listener = (errors: AppError[]) => void;

const listeners = new Set<Listener>();
let errors: AppError[] = [];

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function recoveriesFor(category: AppErrorCategory): AppErrorRecoveryAction[] {
  if (category === "java") return ["open-java-center", "copy-details", "dismiss"];
  if (category === "network" || category === "auth")
    return ["retry", "open-logs", "copy-details", "dismiss"];
  if (category === "download") return ["retry", "open-settings", "copy-details", "dismiss"];
  return ["copy-details", "dismiss"];
}

export class AppRequestError extends Error {
  constructor(public readonly appError: AppError) {
    super(appError.userMessage);
    this.name = "AppRequestError";
  }
}

export function createRendererError(input: AppErrorCreateInput): AppError {
  return {
    id: newId(),
    category: input.category ?? "renderer",
    severity: input.severity ?? "error",
    userMessage: input.userMessage,
    technicalDetails: input.technicalDetails ?? null,
    possibleSolution: input.possibleSolution ?? null,
    timestamp: new Date().toISOString(),
    source: input.source ?? "renderer",
    action: input.action ?? "unknown",
    causeId: input.causeId ?? null,
    recoveries: input.recoveries ?? recoveriesFor(input.category ?? "renderer"),
  };
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

export function normalizeError(
  value: unknown,
  fallback: Partial<AppErrorCreateInput> = {}
): AppError {
  if (value instanceof AppRequestError) return value.appError;
  if (isAppError(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    isAppError((value as { error: unknown }).error)
  ) {
    return (value as { error: AppError }).error;
  }
  if (value instanceof Error) {
    const parsed = parseSerializedAppError(value.message);
    if (parsed) return parsed;
    return createRendererError({
      category: fallback.category ?? "renderer",
      severity: fallback.severity ?? "error",
      userMessage: fallback.userMessage ?? value.message,
      technicalDetails: fallback.technicalDetails ?? value.stack ?? value.message,
      possibleSolution: fallback.possibleSolution ?? "Try again or copy the error details.",
      source: fallback.source ?? "renderer",
      action: fallback.action ?? "unknown",
      recoveries: fallback.recoveries,
    });
  }
  if (typeof value === "string") {
    return createRendererError({
      category: fallback.category ?? "renderer",
      severity: fallback.severity ?? "error",
      userMessage: fallback.userMessage ?? value,
      technicalDetails: fallback.technicalDetails ?? value,
      possibleSolution: fallback.possibleSolution ?? "Try again or copy the error details.",
      source: fallback.source ?? "renderer",
      action: fallback.action ?? "unknown",
      recoveries: fallback.recoveries,
    });
  }
  return createRendererError({
    category: fallback.category ?? "unknown",
    severity: fallback.severity ?? "error",
    userMessage: fallback.userMessage ?? "Something went wrong.",
    technicalDetails: fallback.technicalDetails ?? "Unknown error",
    possibleSolution: fallback.possibleSolution ?? "Try again or copy the error details.",
    source: fallback.source ?? "renderer",
    action: fallback.action ?? "unknown",
    recoveries: fallback.recoveries,
  });
}

function parseSerializedAppError(value: string): AppError | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isAppError(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function notify(): void {
  for (const listener of listeners) listener(errors);
}

export function pushError(error: AppError, options: { report?: boolean } = {}): void {
  errors = [error, ...errors.filter((item) => item.id !== error.id)].slice(0, 20);
  notify();
  if (options.report && typeof window !== "undefined" && window.serverlab?.reportRendererError) {
    window.serverlab.reportRendererError(error).catch(() => {});
  }
}

/** Normalize, publish, and persist a feature error while keeping local UI state available. */
export function reportError(
  value: unknown,
  fallback: Partial<AppErrorCreateInput> = {}
): AppError {
  const appError = normalizeError(value, fallback);
  pushError(appError, { report: true });
  return appError;
}

export function dismissError(id: string): void {
  errors = errors.filter((error) => error.id !== id);
  notify();
}

export function subscribeErrors(listener: Listener): () => void {
  listeners.add(listener);
  listener(errors);
  return () => listeners.delete(listener);
}

export async function captureAsyncError<T>(
  action: string,
  fn: () => Promise<T>,
  fallback?: Partial<AppErrorCreateInput>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const appError = normalizeError(error, { ...fallback, action });
    pushError(appError, { report: appError.category === "renderer" });
    throw new AppRequestError(appError);
  }
}
