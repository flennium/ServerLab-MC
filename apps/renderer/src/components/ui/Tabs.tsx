import clsx from "clsx";

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      className="flex overflow-x-auto rounded-lg border border-border bg-panel p-1"
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
          className={clsx(
            "h-9 shrink-0 rounded px-4 text-sm font-semibold transition-colors",
            value === item.id
              ? "bg-copper text-carbon"
              : "text-muted hover:bg-rail hover:text-white"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
