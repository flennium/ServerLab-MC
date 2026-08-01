import type { ButtonHTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type ButtonSize = "sm" | "md";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-copper bg-copper text-carbon shadow-[0_0_0_1px_rgba(217,130,59,0.25)] hover:bg-copper-hover hover:border-copper-hover",
  secondary:
    "border-border bg-rail text-white hover:border-copper/60 hover:bg-surface-3",
  ghost:
    "border-transparent bg-transparent text-muted hover:bg-rail hover:text-white",
  danger:
    "border-redstone/40 bg-redstone/15 text-redstone hover:border-redstone/70 hover:bg-redstone/25",
  quiet:
    "border-border/70 bg-panel text-muted hover:border-border hover:bg-rail hover:text-white",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-10 gap-2 px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  rightIcon?: LucideIcon;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  icon: Icon,
  rightIcon: RightIcon,
  variant = "secondary",
  size = "md",
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      <span className="truncate">{children}</span>
      {RightIcon && <RightIcon className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  size = "sm",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        size === "md" ? "h-10 w-10" : "h-8 w-8",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
