import clsx from "clsx";
import { Activity, Coffee, LayoutDashboard, Settings, Server } from "lucide-react";
import { useServerStore } from "../../store/serverStore.js";
import { APP_VERSION } from "@serverlab/shared";
import { toHashPath, useHashRoute } from "../../lib/router.js";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/servers", label: "Servers", icon: Server },
  { to: "/java", label: "Java Runtime", icon: Coffee },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const servers = useServerStore((state) => state.servers);
  const running = servers.filter((server) => server.status === "running").length;
  const route = useHashRoute();

  return (
    <aside className="flex h-full w-20 shrink-0 flex-col border-r border-border bg-carbon/95 sm:w-64">
      <div className="flex h-20 items-center gap-3 border-b border-border px-4 sm:px-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-copper/35 bg-copper/10 shadow-[0_0_24px_rgba(121,217,40,0.16)]">
          <img
            src="./serverlab-icon.png"
            alt=""
            aria-hidden="true"
            className="h-10 w-10 object-cover"
          />
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="font-display text-base font-semibold tracking-normal">ServerLab MC</p>
          <p className="mt-0.5 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted">
            Local ops deck
          </p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3 py-4" aria-label="Main navigation">
        {navItems.map(({ to, label, icon: Icon }) => (
          <a
            key={to}
            href={toHashPath(to)}
            className={clsx(
              "group flex h-11 items-center justify-center gap-3 rounded-lg border px-3 text-sm font-semibold transition-colors sm:justify-start",
              route === to || (to === "/servers" && route.startsWith("/servers/"))
                ? "border-copper/45 bg-copper/15 text-copper"
                : "border-transparent text-muted hover:border-border hover:bg-rail hover:text-white"
            )}
            title={label}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden truncate sm:inline">{label}</span>
          </a>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="border-t border-border p-3 sm:p-4">
        <div className="rounded-lg border border-border bg-panel px-3 py-3">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <Activity className="h-4 w-4 text-grass" aria-hidden="true" />
            <span className="hidden text-xs font-semibold text-white sm:inline">Local runtime</span>
          </div>
          <p className="mt-2 hidden text-xs text-muted sm:block">
            {running} of {servers.length} servers running
          </p>
        </div>
        <p className="mt-3 hidden font-mono text-[0.68rem] text-muted sm:block">v{APP_VERSION}</p>
      </div>
    </aside>
  );
}
