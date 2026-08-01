import type { ReactNode } from "react";
import clsx from "clsx";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, meta, actions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-copper">
            {eyebrow}
          </p>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-normal text-white">
            {title}
          </h1>
          {meta}
        </div>
        {description && (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-border bg-panel shadow-[0_14px_45px_rgba(0,0,0,0.18)]",
        interactive && "transition-colors hover:border-copper/45 hover:bg-rail",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  detail,
  tone = "neutral",
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
  className?: string;
}) {
  const toneClass = {
    neutral: "text-white",
    good: "text-grass",
    warn: "text-glowstone",
    danger: "text-redstone",
    info: "text-lapis",
  }[tone];

  return (
    <Card className={clsx("px-4 py-3", className)}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={clsx("mt-1 font-display text-xl font-semibold tabular-nums", toneClass)}>
        {value}
        {detail && <span className="ml-1 font-sans text-sm font-normal text-muted">{detail}</span>}
      </p>
    </Card>
  );
}

export function Alert({
  tone = "info",
  children,
  action,
  className,
}: {
  tone?: "info" | "danger" | "success" | "warning";
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const toneClass = {
    info: "border-lapis/40 bg-lapis/10 text-lapis",
    danger: "border-redstone/40 bg-redstone/10 text-redstone",
    success: "border-grass/40 bg-grass/10 text-grass",
    warning: "border-glowstone/40 bg-glowstone/10 text-glowstone",
  }[tone];

  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm",
        toneClass,
        className
      )}
    >
      <div className="min-w-0">{children}</div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-4 text-copper">{icon}</div>}
      <p className="font-display text-lg font-semibold text-white">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}
