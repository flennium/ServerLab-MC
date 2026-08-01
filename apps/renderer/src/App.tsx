import { Suspense, lazy } from "react";
import { AppShell } from "./components/layout/AppShell.js";
import { Skeleton } from "./components/ui/Skeleton.js";
import { serverRouteId, useHashRoute } from "./lib/router.js";

const DashboardPage = lazy(() => import("./pages/DashboardPage.js").then((module) => ({ default: module.DashboardPage })));
const ServersPage = lazy(() => import("./pages/ServersPage.js").then((module) => ({ default: module.ServersPage })));
const ServerDetailPage = lazy(() => import("./pages/ServerDetailPage.js").then((module) => ({ default: module.ServerDetailPage })));
const JavaManagerPage = lazy(() => import("./pages/JavaManagerPage.js").then((module) => ({ default: module.JavaManagerPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage.js").then((module) => ({ default: module.SettingsPage })));

export function App() {
  const route = useHashRoute();
  const effectiveRoute = route === "/" ? "/dashboard" : route;
  const serverId = serverRouteId(effectiveRoute);

  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        {effectiveRoute === "/dashboard" && <DashboardPage />}
        {effectiveRoute === "/servers" && <ServersPage />}
        {serverId && <ServerDetailPage serverId={serverId} />}
        {effectiveRoute === "/java" && <JavaManagerPage />}
        {effectiveRoute === "/settings" && <SettingsPage />}
        {!["/dashboard", "/servers", "/java", "/settings"].includes(effectiveRoute) && !serverId && (
          <DashboardPage />
        )}
      </Suspense>
    </AppShell>
  );
}
