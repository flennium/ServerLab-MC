import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { ServersPage } from "./pages/ServersPage.tsx";
import { ServerDetailPage } from "./pages/ServerDetailPage.tsx";
import { JavaManagerPage } from "./pages/JavaManagerPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";

export function App() {
  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/servers/:id" element={<ServerDetailPage />} />
          <Route path="/java" element={<JavaManagerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}
