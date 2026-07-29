import { NavLink } from "react-router-dom";
import clsx from "clsx";

const navItems = [
  { to: "/dashboard", label: "Dashboard",    icon: "⊞" },
  { to: "/servers",   label: "Servers",       icon: "⬡" },
  { to: "/java",      label: "Java Manager",  icon: "☕" },
  { to: "/settings",  label: "Settings",      icon: "⚙" },
] as const;

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <span className="text-accent text-xl font-bold">⬡</span>
        <span className="font-semibold tracking-tight">ServerLab MC</span>
      </div>

      {/* Nav */}
      <nav
        className="flex flex-col gap-0.5 px-3 pt-2"
        aria-label="Main navigation"
      >
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-surface-3 text-white"
                  : "text-muted hover:bg-surface-2 hover:text-white"
              )
            }
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="px-5 py-4 text-xs text-muted">v2.1.0</div>
    </aside>
  );
}
