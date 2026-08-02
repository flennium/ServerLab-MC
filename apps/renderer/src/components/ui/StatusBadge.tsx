import clsx from "clsx";
import type { ServerStatus } from "@serverlab/shared";

const CONFIG: Record<ServerStatus, { label: string; dot: string; shell: string }> = {
  running: {
    label: "Running",
    dot: "bg-grass shadow-[0_0_12px_rgba(100,214,58,0.65)]",
    shell: "border-grass/30 bg-grass/10 text-grass",
  },
  starting: {
    label: "Starting",
    dot: "animate-pulse bg-glowstone",
    shell: "border-glowstone/30 bg-glowstone/10 text-glowstone",
  },
  stopping: {
    label: "Stopping",
    dot: "animate-pulse bg-glowstone",
    shell: "border-glowstone/30 bg-glowstone/10 text-glowstone",
  },
  stopped: {
    label: "Offline",
    dot: "bg-muted",
    shell: "border-border bg-rail text-muted",
  },
  crashed: {
    label: "Crashed",
    dot: "bg-redstone",
    shell: "border-redstone/35 bg-redstone/10 text-redstone",
  },
};

interface StatusBadgeProps {
  status: ServerStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { label, dot, shell } = CONFIG[status] ?? CONFIG.stopped;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        shell,
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
