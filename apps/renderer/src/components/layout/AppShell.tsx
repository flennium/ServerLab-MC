import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Menu, Minus, Square, X } from "lucide-react";
import { Sidebar } from "./Sidebar.tsx";
import { IconButton } from "../ui/Button.js";
import { serverRouteId, useHashRoute } from "../../lib/router.js";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const route = useHashRoute();
  const isServerDetail = serverRouteId(route) !== null;

  return (
    <div className="operator-grid flex h-screen w-screen flex-col overflow-hidden bg-carbon text-white">
      <header className="app-drag relative z-50 flex h-9 shrink-0 items-center justify-between border-b border-border bg-carbon/95 pl-2 sm:pl-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="app-no-drag inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-rail text-muted transition-colors hover:border-copper/60 hover:text-white md:hidden"
            aria-label="Open sidebar"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
          <img
            src="./serverlab-icon.png"
            alt=""
            aria-hidden="true"
            className="h-5 w-5 rounded border border-copper/30 object-cover"
          />
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-muted">
            ServerLab MC
          </span>
        </div>
        <div className="app-no-drag flex h-full">
          <IconButton
            icon={Minus}
            label="Minimize"
            variant="ghost"
            className="h-9 w-11 rounded-none border-0"
            onClick={() => window.serverlab?.minimizeWindow?.()}
          />
          <IconButton
            icon={Square}
            label="Maximize or restore"
            variant="ghost"
            className="h-9 w-11 rounded-none border-0"
            onClick={() => window.serverlab?.toggleMaximizeWindow?.()}
          />
          <IconButton
            icon={X}
            label="Close"
            variant="ghost"
            className="h-9 w-11 rounded-none border-0 hover:bg-redstone/25 hover:text-redstone"
            onClick={() => window.serverlab?.closeWindow?.()}
          />
        </div>
      </header>
      <div className="min-h-0 flex flex-1">
        {mobileSidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-x-0 bottom-0 top-9 z-30 bg-black/55 backdrop-blur-sm md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
        <main
          className={clsx(
            "min-w-0 flex-1 overscroll-contain bg-gradient-to-b from-surface-1/95 to-carbon/95 px-4 py-4 sm:px-6 lg:px-8",
            isServerDetail ? "min-h-0 overflow-hidden" : "overflow-auto"
          )}
        >
          <div className={clsx("mx-auto flex w-full max-w-7xl flex-col", isServerDetail && "h-full min-h-0")}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
