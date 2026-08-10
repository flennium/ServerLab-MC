import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AlertCircle, Copy, ExternalLink, X } from "lucide-react";
import type { AppError, AppErrorRecoveryAction } from "@serverlab/shared";
import {
  dismissError,
  normalizeError,
  pushError,
  subscribeErrors,
} from "../../lib/errorStore.js";
import { Button, IconButton } from "../ui/Button.js";
import { Alert, Card, EmptyState } from "../ui/Layout.js";
import { navigate } from "../../lib/router.js";

interface ErrorContextValue {
  reportError: (error: unknown, fallback?: Partial<AppError>) => AppError;
  dismissError: (id: string) => void;
}

const ErrorContext = createContext<ErrorContextValue | null>(null);

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [errors, setErrors] = useState<AppError[]>([]);

  useEffect(() => subscribeErrors(setErrors), []);

  useEffect(() => {
    const onUnhandled = (event: ErrorEvent) => {
      const error = normalizeError(event.error ?? event.message, {
        category: "renderer",
        severity: "critical",
        userMessage: "The interface hit an unexpected error.",
        source: "renderer:window",
        action: "unhandled-error",
      });
      pushError(error, { report: true });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const error = normalizeError(event.reason, {
        category: "renderer",
        severity: "error",
        userMessage: "An action failed unexpectedly.",
        source: "renderer:promise",
        action: "unhandled-rejection",
      });
      pushError(error, { report: true });
    };
    window.addEventListener("error", onUnhandled);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onUnhandled);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const context = useMemo<ErrorContextValue>(
    () => ({
      reportError(error, fallback) {
        const appError = normalizeError(error, fallback);
        pushError(appError, { report: true });
        return appError;
      },
      dismissError,
    }),
    []
  );

  const visible = errors.filter((error) => error.severity !== "info").slice(0, 4);
  const critical = visible.find((error) => error.severity === "critical");

  return (
    <ErrorContext.Provider value={context}>
      {children}
      <ErrorToastHost errors={visible} />
      {critical && <CriticalErrorDialog error={critical} />}
    </ErrorContext.Provider>
  );
}

export function useError() {
  const context = useContext(ErrorContext);
  if (!context) throw new Error("useError must be used inside ErrorProvider");
  return context;
}

export function InlineError({ error }: { error: AppError | null }) {
  if (!error) return null;
  return <ErrorBanner error={error} compact />;
}

export function ErrorBanner({
  error,
  compact = false,
}: {
  error: AppError;
  compact?: boolean;
}) {
  return (
    <Alert
      tone={error.severity === "warning" ? "warning" : "danger"}
      placement={compact ? "inline" : "panel"}
    >
      <div className="min-w-0">
        <p className="font-semibold">{error.userMessage}</p>
        {!compact && error.possibleSolution && (
          <p className="mt-1 text-xs leading-5 opacity-80">{error.possibleSolution}</p>
        )}
      </div>
    </Alert>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: AppError;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon={<AlertCircle className="h-10 w-10" aria-hidden="true" />}
      title={error.userMessage}
      description={error.possibleSolution ?? "Copy the error details if this keeps happening."}
      action={<ErrorActionButtons error={error} onRetry={onRetry} />}
    />
  );
}

function ErrorToastHost({ errors }: { errors: AppError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-12 z-50 grid w-[min(28rem,calc(100vw-2rem))] gap-2">
      {errors.map((error) => (
        <Alert
          key={error.id}
          tone={error.severity === "warning" ? "warning" : "danger"}
          placement="toast"
          className="pointer-events-auto bg-panel/95"
          autoDismissMs={error.severity === "critical" ? undefined : 9000}
          dismissKey={error.id}
          onDismiss={() => dismissError(error.id)}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-redstone" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{error.userMessage}</p>
              {error.possibleSolution && (
                <p className="mt-1 text-xs leading-5 text-muted">
                  {error.possibleSolution}
                </p>
              )}
              <ErrorActionButtons error={error} compact />
            </div>
            <IconButton
              icon={X}
              label="Dismiss error"
              onClick={() => dismissError(error.id)}
            />
          </div>
        </Alert>
      ))}
    </div>
  );
}

function CriticalErrorDialog({ error }: { error: AppError }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <Card className="w-full max-w-lg border-redstone/50 p-5">
        <div className="mb-3 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-redstone" />
          <h2 className="font-display text-lg font-semibold text-white">
            Critical issue
          </h2>
        </div>
        <p className="text-sm text-white">{error.userMessage}</p>
        {error.possibleSolution && (
          <p className="mt-2 text-sm leading-6 text-muted">{error.possibleSolution}</p>
        )}
        <ErrorActionButtons error={error} />
      </Card>
    </div>
  );
}

export function ErrorActionButtons({
  error,
  compact = false,
  onRetry,
}: {
  error: AppError;
  compact?: boolean;
  onRetry?: () => void;
}) {
  const actions = compact ? error.recoveries.slice(0, 2) : error.recoveries;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          onClick={() => runRecovery(action, error, onRetry)}
          icon={action === "copy-details" ? Copy : ExternalLink}
          variant={action === "dismiss" ? "quiet" : "secondary"}
          size="sm"
        >
          {labelFor(action)}
        </Button>
      ))}
    </div>
  );
}

function labelFor(action: AppErrorRecoveryAction): string {
  const labels: Record<AppErrorRecoveryAction, string> = {
    retry: "Retry",
    "open-settings": "Settings",
    "open-java-center": "Java",
    "open-logs": "Logs",
    "copy-details": "Copy",
    "report-issue": "Report",
    dismiss: "Dismiss",
  };
  return labels[action];
}

function runRecovery(
  action: AppErrorRecoveryAction,
  error: AppError,
  onRetry?: () => void
): void {
  if (action === "retry") onRetry?.();
  if (action === "open-settings" || action === "open-logs") navigate("/settings");
  if (action === "open-java-center") navigate("/java");
  if (action === "copy-details") {
    navigator.clipboard
      .writeText(JSON.stringify(error, null, 2))
      .catch((cause) => {
        pushError(
          normalizeError(cause, {
            category: "renderer",
            severity: "warning",
            userMessage: "Error details could not be copied.",
            possibleSolution: "Copy the details manually from Error history.",
            source: "renderer:error-actions",
            action: "copy-error-details",
          }),
          { report: true }
        );
      });
  }
  if (action === "dismiss") dismissError(error.id);
}
