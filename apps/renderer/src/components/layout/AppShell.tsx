import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar.js";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-surface-1 p-6">
        {children}
      </main>
    </div>
  );
}
