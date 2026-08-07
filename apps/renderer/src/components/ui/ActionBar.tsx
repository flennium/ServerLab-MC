import type { ReactNode } from "react";
import clsx from "clsx";
import { ManagementHeader } from "./Layout.js";

export function ActionBar({
  eyebrow,
  title,
  description,
  status,
  primaryActions,
  secondaryActions,
  children,
  sticky = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: ReactNode;
  primaryActions?: ReactNode;
  secondaryActions?: ReactNode;
  children?: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        sticky &&
          "-mx-4 border-b border-border bg-surface-1/95 px-4 pb-3 pt-1 shadow-[0_12px_35px_rgba(0,0,0,0.22)] backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        sticky ? "sticky top-0 z-20" : "rounded-lg border border-border bg-panel p-4",
        className
      )}
    >
      <div className="mx-auto grid w-full max-w-7xl gap-3">
        <ManagementHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          meta={status}
          actions={
            (primaryActions || secondaryActions) && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {primaryActions}
                {primaryActions && secondaryActions && (
                  <span className="hidden h-7 w-px bg-border sm:block" aria-hidden="true" />
                )}
                {secondaryActions}
              </div>
            )
          }
          compact
          className="mb-0"
        />
        {children}
      </div>
    </section>
  );
}
