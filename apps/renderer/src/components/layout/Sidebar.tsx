import clsx from "clsx";
import { useEffect, useState } from "react";
import {
  Activity,
  Coffee,
  LayoutDashboard,
  Settings,
  Server,
  X,
} from "lucide-react";
import { useServerStore } from "../../store/serverStore.js";
import { APP_VERSION } from "@serverlab/shared";
import { toHashPath, useHashRoute } from "../../lib/router.js";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/servers", label: "Servers", icon: Server },
  { to: "/java", label: "Java Runtime", icon: Coffee },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const servers = useServerStore((state) => state.servers);
  const running = servers.filter((server) => server.status === "running").length;
  const route = useHashRoute();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("serverlab.sidebar.collapsed") === "true");

  useEffect(() => {
    localStorage.setItem("serverlab.sidebar.collapsed", String(collapsed));
  }, [collapsed]);

  return (
    <aside
      className={clsx(
        "fixed left-0 top-9 z-40 flex h-[calc(100vh-2.25rem)] w-[240px] shrink-0 flex-col border-r border-border bg-carbon/98 shadow-2xl transition-[transform,width] duration-200 ease-out motion-reduce:transition-none md:static md:top-auto md:z-auto md:h-full md:translate-x-0 md:shadow-none",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        collapsed ? "md:w-[70px]" : "md:w-[240px]"
      )}
    >
      <div
        className={clsx(
          "flex h-20 items-center border-b border-border px-4 transition-all motion-reduce:transition-none",
          collapsed ? "md:justify-center md:px-3" : "gap-3 md:px-5"
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="group hidden h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-copper/35 bg-copper/10 shadow-[0_0_24px_rgba(121,217,40,0.16)] transition-colors motion-reduce:transition-none hover:border-copper hover:bg-copper/20 md:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <img
            src="./serverlab-icon.png"
            alt=""
            aria-hidden="true"
            className="h-10 w-10 object-cover transition-transform motion-reduce:transition-none motion-reduce:group-hover:scale-100 group-hover:scale-105"
          />
        </button>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-copper/35 bg-copper/10 shadow-[0_0_24px_rgba(121,217,40,0.16)] md:hidden">
          <img
            src="./serverlab-icon.png"
            alt=""
            aria-hidden="true"
            className="h-10 w-10 object-cover"
          />
        </div>
        <div className={clsx("min-w-0 transition-opacity motion-reduce:transition-none", collapsed ? "md:hidden" : "block")}>
          <p className="font-display text-base font-semibold tracking-normal">ServerLab MC</p>
          <p className="mt-0.5 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted">
            Local ops deck
          </p>
        </div>
        <button
          type="button"
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded border border-border bg-rail text-muted transition-colors motion-reduce:transition-none hover:border-copper/60 hover:text-white md:hidden"
          aria-label="Close sidebar"
          onClick={onMobileClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <nav className={clsx("flex flex-col gap-1 py-4", collapsed ? "md:px-2" : "px-3")} aria-label="Main navigation">
        {navItems.map(({ to, label, icon: Icon }) => (
          <a
            key={to}
            href={toHashPath(to)}
            onClick={onMobileClose}
            className={clsx(
              "group relative flex h-11 items-center justify-center gap-3 rounded-lg border px-3 text-sm font-semibold transition-colors motion-reduce:transition-none",
              collapsed ? "md:px-0" : "md:justify-start",
              route === to || (to === "/servers" && route.startsWith("/servers/"))
                ? "border-copper/45 bg-copper/15 text-copper"
                : "border-transparent text-muted hover:border-border hover:bg-rail hover:text-white"
            )}
            title={label}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className={clsx("truncate", collapsed ? "md:hidden" : "inline")}>{label}</span>
            {collapsed && (
              <span className="pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-50 hidden -translate-y-1/2 rounded border border-border bg-carbon px-2 py-1 text-xs text-white opacity-0 shadow-xl transition-opacity motion-reduce:transition-none group-hover:opacity-100 md:block">
                {label}
              </span>
            )}
          </a>
        ))}
      </nav>

      <div className="flex-1" />

      <div className={clsx("border-t border-border p-3", !collapsed && "md:p-4")}>
        <div className="rounded-lg border border-border bg-panel px-3 py-3">
          <div className={clsx("flex items-center justify-center gap-2", !collapsed && "md:justify-start")}>
            <Activity className="h-4 w-4 text-grass" aria-hidden="true" />
            <span className={clsx("text-xs font-semibold text-white", collapsed && "md:hidden")}>Local runtime</span>
          </div>
          <p className={clsx("mt-2 text-xs text-muted", collapsed && "md:hidden")}>
            {running} of {servers.length} servers running
          </p>
        </div>
        <p className={clsx("mt-3 font-mono text-[0.68rem] text-muted", collapsed && "md:hidden")}>v{APP_VERSION}</p>
      </div>
    </aside>
  );
}
