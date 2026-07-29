import clsx from "clsx";
import type { ServerStatus } from "@serverlab/shared";

const CONFIG: Record<ServerStatus, { label: string; dot: string }> = {
  running:  { label: "Running",  dot: "bg-accent" },
  starting: { label: "Starting", dot: "bg-warning animate-pulse" },
  stopping: { label: "Stopping", dot: "bg-warning animate-pulse" },
  stopped:  { label: "Offline",  dot: "bg-muted" },
  crashed:  { label: "Crashed",  dot: "bg-danger" },
};

interface StatusBadgeProps {
  status: ServerStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, dot } = CONFIG[status] ?? CONFIG.stopped;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        "bg-surface-3 text-white",
        className
      )}
      role="status"
      aria-label={`Server status: ${label}`}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", dot)} aria-hidden="true" />
      {label}
    </span>
  );
}
