import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Clock3,
  Database,
  FolderOpen,
  Gauge,
  Play,
  Plus,
  Server,
  Square,
  TerminalSquare,
} from "lucide-react";
import { useServerStore } from "../store/serverStore.js";
import { useStatsStore } from "../store/statsStore.js";
import { StatusBadge } from "../components/ui/StatusBadge.js";
import { ServerCardSkeleton } from "../components/ui/Skeleton.js";
import { Alert, Card, EmptyState, ManagementHeader } from "../components/ui/Layout.js";
import { Button } from "../components/ui/Button.js";
import { api } from "../lib/apiClient.js";
import { toHashPath } from "../lib/router.js";
import type {
  JavaRuntimeListResponse,
  Server as ServerModel,
  SoftwareArtifactListResponse,
} from "@serverlab/shared";

type ServerStats = ReturnType<typeof useStatsStore.getState>["stats"][string]["latest"];

interface EnvironmentSummary {
  validRuntimes: number;
  managedRuntimes: number;
  cachedSoftware: number;
  cacheBytes: number;
}

export function DashboardPage() {
  const { servers, fetchServers, startServer, stopServer } = useServerStore();
  const { getStats } = useStatsStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<EnvironmentSummary>({
    validRuntimes: 0,
    managedRuntimes: 0,
    cachedSoftware: 0,
    cacheBytes: 0,
  });
  const reduceMotion = useReducedMotion();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchServers(), loadEnvironment(setEnvironment)])
      .catch((error) =>
        setError(error instanceof Error ? error.message : "Failed to load dashboard")
      )
      .finally(() => setLoading(false));
  }, [fetchServers]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedServers = useMemo(() => orderServersForDashboard(servers), [servers]);
  const autoStart = servers.filter((server) => server.autoStart).length;
  const activeServers = sortedServers.filter(
    (server) => server.status === "running" || server.status === "starting"
  );
  const attentionItems = buildAttentionItems(servers, environment);
  const visibleServers = sortedServers.slice(0, 8);

  if (loading) {
    return (
      <div>
        <ManagementHeader
          eyebrow="Server hosting panel"
          title="Dashboard"
          description="Live status for the Minecraft servers on this machine."
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ServerCardSkeleton />
          <ServerCardSkeleton />
          <ServerCardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div>
      <ManagementHeader
        eyebrow="Server hosting panel"
        title="Dashboard"
        description="Manage local Minecraft servers from a focused, lightweight workspace."
      />

      {error && (
        <Alert tone="danger" className="mb-4" action={<Button onClick={load} size="sm" variant="danger">Retry</Button>}>
          {error}
        </Alert>
      )}

      {servers.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-10 w-10" aria-hidden="true" />}
          title="No servers configured"
          description="Create a local Minecraft server profile to start monitoring console output, files, backups, and runtime stats."
          action={
            <a
              href={toHashPath("/servers")}
              className="inline-flex h-10 items-center gap-2 rounded border border-copper bg-copper px-4 text-sm font-semibold text-carbon transition-colors hover:border-copper-hover hover:bg-copper-hover"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create server
            </a>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.55fr_0.7fr]">
          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">Server overview</h2>
                <p className="text-sm text-muted">
                  {activeServers.length
                    ? `${activeServers.length} active server${activeServers.length === 1 ? "" : "s"} pinned to the top.`
                    : "Stopped servers are ready when you are."}
                </p>
              </div>
              <a
                href={toHashPath("/servers")}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-rail px-3 text-xs font-semibold text-white transition-colors hover:border-copper/60 hover:bg-surface-3"
              >
                All servers
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {visibleServers.map((server, index) => (
                <motion.div
                  key={server.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.18,
                    delay: reduceMotion ? 0 : index * 0.02,
                  }}
                >
                  <ServerOverviewCard
                    server={server}
                    stats={getStats(server.id).latest}
                    onStart={() => startServer(server.id)}
                    onStop={() => stopServer(server.id)}
                  />
                </motion.div>
              ))}
            </div>
          </section>

          <aside className="grid content-start gap-4">
            <AttentionPanel items={attentionItems} />
            <OpsPanel
              autoStart={autoStart}
              cachedSoftware={environment.cachedSoftware}
              cacheBytes={environment.cacheBytes}
              managedRuntimes={environment.managedRuntimes}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

async function loadEnvironment(
  setEnvironment: (summary: EnvironmentSummary) => void
) {
  try {
    const [javaData, cacheData] = await Promise.all([
      api.get<JavaRuntimeListResponse>("/api/java/runtimes"),
      api.get<SoftwareArtifactListResponse>("/api/software/cache"),
    ]);
    const validRuntimes = javaData.runtimes.filter((runtime) => runtime.status === "valid");
    const managedRuntimes = validRuntimes.filter((runtime) => runtime.source === "managed");
    setEnvironment({
      validRuntimes: validRuntimes.length,
      managedRuntimes: managedRuntimes.length,
      cachedSoftware: cacheData.artifacts.length,
      cacheBytes: cacheData.artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0),
    });
  } catch {
    setEnvironment({
      validRuntimes: 0,
      managedRuntimes: 0,
      cachedSoftware: 0,
      cacheBytes: 0,
    });
  }
}

function orderServersForDashboard(servers: ServerModel[]): ServerModel[] {
  const weight = {
    crashed: 0,
    starting: 1,
    running: 2,
    stopping: 3,
    stopped: 4,
  };
  return [...servers].sort((left, right) => {
    const statusDelta = weight[left.status] - weight[right.status];
    if (statusDelta !== 0) return statusDelta;
    return left.name.localeCompare(right.name);
  });
}

function buildAttentionItems(
  servers: ServerModel[],
  environment: EnvironmentSummary
): Array<{ label: string; detail: string; tone: "danger" | "warn" | "good" }> {
  const items: Array<{ label: string; detail: string; tone: "danger" | "warn" | "good" }> = [];
  const crashed = servers.filter((server) => server.status === "crashed");
  if (crashed.length) {
    items.push({
      label: "Crashed servers",
      detail: crashed.map((server) => server.name).join(", "),
      tone: "danger",
    });
  }
  if (!environment.validRuntimes) {
    items.push({
      label: "No valid Java runtime",
      detail: "Install or scan Java before creating servers.",
      tone: "warn",
    });
  }
  if (!environment.cachedSoftware) {
    items.push({
      label: "Software cache empty",
      detail: "The first server creation will download a server jar.",
      tone: "warn",
    });
  }
  if (!items.length) {
    items.push({
      label: "Fleet is clear",
      detail: "No crashed servers or missing runtime signals.",
      tone: "good",
    });
  }
  return items;
}

function ServerOverviewCard({
  server,
  stats,
  onStart,
  onStop,
}: {
  server: ServerModel;
  stats: ServerStats;
  onStart: () => void;
  onStop: () => void;
}) {
  const isActive = server.status === "running" || server.status === "starting";
  const ramPercent = stats ? stats.ramMb / server.ramMaxMb : 0;

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_0.95fr_auto]">
        <div className="min-w-0 border-b border-border p-4 md:border-b-0 md:border-r">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <Server className="h-4 w-4 shrink-0 text-copper" aria-hidden="true" />
                <h2 className="truncate font-display text-lg font-semibold text-white">
                  {server.name}
                </h2>
              </div>
              <p className="mt-1 text-sm capitalize text-muted">
                {server.software} {server.version} / port {server.port}
              </p>
            </div>
            <StatusBadge status={server.status} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted">
            <ServerFact icon={TerminalSquare} label="Java" value={server.javaRuntimeId ? "Managed" : "Manual"} />
            <ServerFact icon={Clock3} label="Auto-start" value={server.autoStart ? "Enabled" : "Off"} />
          </div>
        </div>

        <div className="border-b border-border bg-surface-console p-4 md:border-b-0 md:border-r">
          {stats && server.status === "running" ? (
            <div className="grid grid-cols-4 gap-3">
              <MiniMetric label="CPU" value={`${stats.cpu}%`} tone={stats.cpu > 80 ? "danger" : "good"} />
              <MiniMetric label="RAM" value={`${stats.ramMb} MB`} tone={ramPercent > 0.9 ? "danger" : "neutral"} />
              <MiniMetric label="TPS" value={stats.tps.toFixed(1)} tone={stats.tps < 18 ? "warn" : "good"} />
              <MiniMetric label="Players" value={stats.players} tone="info" />
            </div>
          ) : (
            <div className="flex h-full min-h-16 items-center gap-3 text-sm text-muted">
              <Gauge className="h-4 w-4 text-copper" aria-hidden="true" />
              <span>
                {server.status === "crashed"
                  ? "Open the server console to review the last output."
                  : "Live metrics appear as soon as the server is running."}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 p-4 md:flex-col md:items-stretch md:justify-center">
          {isActive ? (
            <Button onClick={onStop} icon={Square} variant="secondary" size="sm">
              Stop
            </Button>
          ) : (
            <Button onClick={onStart} icon={Play} variant="primary" size="sm">
              Start
            </Button>
          )}
          <a
            href={toHashPath(`/servers/${encodeURIComponent(server.id)}`)}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-border bg-rail px-3 text-xs font-semibold text-white transition-colors hover:border-copper/60 hover:bg-surface-3"
          >
            Open
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </Card>
  );
}

function AttentionPanel({
  items,
}: {
  items: Array<{ label: string; detail: string; tone: "danger" | "warn" | "good" }>;
}) {
  const toneClass = {
    danger: "text-redstone border-redstone/30 bg-redstone/10",
    warn: "text-glowstone border-glowstone/30 bg-glowstone/10",
    good: "text-grass border-grass/30 bg-grass/10",
  };
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-copper" aria-hidden="true" />
        <h2 className="font-display text-lg font-semibold text-white">Attention</h2>
      </div>
      <div className="grid gap-2">
        {items.map((item) => (
          <div key={item.label} className={`rounded border px-3 py-2 ${toneClass[item.tone]}`}>
            <p className="text-sm font-semibold">{item.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OpsPanel({
  autoStart,
  cachedSoftware,
  cacheBytes,
  managedRuntimes,
}: {
  autoStart: number;
  cachedSoftware: number;
  cacheBytes: number;
  managedRuntimes: number;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Database className="h-4 w-4 text-copper" aria-hidden="true" />
        <h2 className="font-display text-lg font-semibold text-white">Local resources</h2>
      </div>
      <div className="grid gap-2 text-sm">
        <OpsRow label="Auto-start profiles" value={autoStart} />
        <OpsRow label="Managed Java" value={managedRuntimes} />
        <OpsRow label="Cached jars" value={cachedSoftware} />
        <OpsRow label="Cache size" value={formatBytes(cacheBytes)} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={toHashPath("/java")} className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-border bg-rail px-3 text-xs font-semibold text-white transition-colors hover:border-copper/60 hover:bg-surface-3">
          Java
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <a href={toHashPath("/settings")} className="inline-flex h-8 items-center justify-center gap-1.5 rounded border border-border bg-rail px-3 text-xs font-semibold text-white transition-colors hover:border-copper/60 hover:bg-surface-3">
          Cache
          <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </Card>
  );
}

function ServerFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof TerminalSquare;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded border border-border bg-rail px-2 py-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-copper" aria-hidden="true" />
      <span className="truncate">
        {label}: <span className="text-white">{value}</span>
      </span>
    </div>
  );
}

function OpsRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-border bg-surface-console px-3 py-2">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-xs font-semibold text-white">{value}</span>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "neutral" | "good" | "warn" | "danger" | "info";
}) {
  const toneClass = {
    neutral: "text-white",
    good: "text-grass",
    warn: "text-glowstone",
    danger: "text-redstone",
    info: "text-lapis",
  }[tone];

  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className={`truncate font-mono text-sm font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
