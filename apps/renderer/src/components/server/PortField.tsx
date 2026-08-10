import { useEffect, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { api } from "../../lib/apiClient.js";
import { reportError } from "../../lib/errorStore.js";
import { Button } from "../ui/Button.js";
import { Field, TextInput } from "../ui/Form.js";
import type { PortCheckResponse, PortStatus } from "@serverlab/shared";

interface PortFieldProps {
  value: number | undefined;
  onChange: (value: number) => void;
  excludeServerId?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  onStatusChange?: (status: PortStatus | null) => void;
}

export function PortField({
  value,
  onChange,
  excludeServerId,
  label = "Port",
  hint,
  disabled,
  onStatusChange,
}: PortFieldProps) {
  const [status, setStatus] = useState<PortStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!value || value < 1 || value > 65535) {
      setStatus(null);
      onStatusChange?.(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      setChecking(true);
      const query = new URLSearchParams({ port: String(value) });
      if (excludeServerId) query.set("excludeServerId", excludeServerId);
      api
        .get<PortCheckResponse>(`/api/ports/check?${query.toString()}`)
        .then(({ status }) => {
          setStatus(status);
          onStatusChange?.(status);
        })
        .catch((error) => {
          setStatus(null);
          onStatusChange?.(null);
          reportError(error, {
            category: "network",
            severity: "warning",
            userMessage: "Port availability could not be checked.",
            possibleSolution: "Check the port manually or retry in a moment.",
            source: "renderer:port-field",
            action: "check-port",
          });
        })
        .finally(() => setChecking(false));
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [excludeServerId, onStatusChange, value]);

  const tone = !status
    ? "border-border bg-rail text-muted"
    : status.available
      ? "border-grass/40 bg-grass/10 text-grass"
      : "border-glowstone/40 bg-glowstone/10 text-glowstone";
  const Icon = status?.available ? CheckCircle2 : ShieldAlert;

  return (
    <Field label={label} hint={hint}>
      <div className="grid gap-2">
        <TextInput
          type="number"
          value={value ?? ""}
          onChange={(event) => onChange(Number(event.target.value))}
          min={1024}
          max={65535}
          disabled={disabled}
        />
        <div className={clsx("flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-xs", tone)}>
          <span className="inline-flex min-w-0 items-center gap-2">
            {checking ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="min-w-0 truncate">
              {checking
                ? "Checking port..."
                : status
                  ? status.message
                  : "Enter a port to check availability."}
            </span>
          </span>
          {!status?.available && status?.suggestedPort && (
            <Button
              onClick={() => onChange(status.suggestedPort!)}
              variant="secondary"
              size="sm"
            >
              Use {status.suggestedPort}
            </Button>
          )}
        </div>
        {!status?.available && status?.processName && (
          <p className="truncate font-mono text-[0.68rem] text-muted">
            {status.processName}
            {status.processId ? ` (${status.processId})` : ""}
          </p>
        )}
      </div>
    </Field>
  );
}
