import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import clsx from "clsx";

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label className="text-xs font-semibold text-muted">
        {label}
        {required && <span className="ml-1 text-redstone">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs leading-5 text-muted">{hint}</p>}
    </div>
  );
}

export const inputClass =
  "w-full rounded border border-border bg-rail px-3 py-2 text-sm text-white placeholder:text-muted transition-colors focus:border-copper focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(inputClass, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputClass, "min-h-24 resize-y", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputClass, className)} {...props}>
      {children}
    </select>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={clsx("flex cursor-pointer items-center justify-between gap-3 text-sm", className)}>
      <span className="font-medium text-white">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
        {...props}
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 rounded-full border border-border bg-rail transition-colors peer-checked:border-copper peer-checked:bg-copper/30"
      >
        <span
          className={clsx(
            "absolute left-1 top-1 h-4 w-4 rounded-full transition-transform",
            checked ? "translate-x-5 bg-copper" : "bg-muted"
          )}
        />
      </span>
    </label>
  );
}

export function LabelValue({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex items-center justify-between gap-4 text-sm", className)}>
      <span className="text-muted">{label}</span>
      <span className="min-w-0 truncate font-medium text-white">{value}</span>
    </div>
  );
}
