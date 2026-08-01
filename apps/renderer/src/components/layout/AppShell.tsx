import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar.tsx";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="operator-grid flex h-screen w-screen overflow-hidden bg-carbon text-white">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto bg-gradient-to-b from-surface-1/95 to-carbon/95 px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col py-2">{children}</div>
      </main>
    </div>
  );
}
