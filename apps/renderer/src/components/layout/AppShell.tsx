import type { ReactNode } from "react";
import { Minus, Square, X } from "lucide-react";
import { Sidebar } from "./Sidebar.tsx";
import { IconButton } from "../ui/Button.js";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="operator-grid flex h-screen w-screen flex-col overflow-hidden bg-carbon text-white">
      <header className="app-drag flex h-9 shrink-0 items-center justify-between border-b border-border bg-carbon/95 pl-4">
        <div className="flex items-center gap-2">
          <img
            src="/serverlab-icon.png"
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
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto bg-gradient-to-b from-surface-1/95 to-carbon/95 px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col py-2">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
