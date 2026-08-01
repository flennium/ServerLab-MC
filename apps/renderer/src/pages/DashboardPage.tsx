import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Boxes, Play, Plus, Server, Square, TriangleAlert } from "lucide-react";
import { useServerStore } from "../store/serverStore.js";
import { useStatsStore } from "../store/statsStore.js";
import { StatusBadge } from "../components/ui/StatusBadge.js";
import { ServerCardSkeleton } from "../components/ui/Skeleton.js";
import { Alert, Card, EmptyState, PageHeader, StatTile } from "../components/ui/Layout.js";
import { Button } from "../components/ui/Button.js";
import { toHashPath } from "../lib/router.js";
import type { Server as ServerModel } from "@serverlab/shared";

export function DashboardPage() {
  const { servers, fetchServers, startServer, stopServer } = useServerStore();
  const { getStats } = useStatsStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchServers()
      .catch((error) =>
        setError(error instanceof Error ? error.message : "Failed to load servers")
      )
      .finally(() => setLoading(false));
  }, [fetchServers]);

  useEffect(() => {
    load();
  }, [load]);

  const running = servers.filter((server) => server.status === "running").length;
  const attention = servers.filter((server) => server.status === "crashed").length;
  const latestServers = servers.slice(0, 6);

  if (loading) {
    return (
      <div>
        <PageHeader
          eyebrow="Command center"
          title="Dashboard"
          description="Live status for the local Minecraft servers on this machine."
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
      <PageHeader
        eyebrow="Command center"
        title="Dashboard"
        description="Live status for the local Minecraft servers on this machine."
        actions={
          <a
            href={toHashPath("/servers")}
            className="inline-flex h-10 items-center gap-2 rounded border border-copper bg-copper px-4 text-sm font-semibold text-carbon transition-colors hover:bg-copper-hover"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New server
          </a>
        }
      />

      {error && (
        <Alert
          tone="danger"
          className="mb-4"
          action={
            <Button onClick={load} size="sm" variant="danger">
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Servers" value={servers.length} detail="tracked" tone="info" />
        <StatTile label="Running" value={running} detail={`/ ${servers.length}`} tone="good" />
        <StatTile
          label="Attention"
          value={attention}
          detail={attention === 1 ? "crashed" : "crashed"}
          tone={attention > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="Auto-start"
          value={servers.filter((server) => server.autoStart).length}
          detail="enabled"
          tone="warn"
        />
      </div>

      {servers.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-10 w-10" aria-hidden="true" />}
          title="No servers configured"
          description="Create a local Minecraft server profile to start monitoring console output, files, backups, and runtime stats."
          action={
            <a
              href={toHashPath("/servers")}
              className="inline-flex h-10 items-center gap-2 rounded border border-copper bg-copper px-4 text-sm font-semibold text-carbon transition-colors hover:bg-copper-hover"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create server
            </a>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {latestServers.map((server, index) => (
            <motion.div
              key={server.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: index * 0.02 }}
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
      )}
    </div>
  );
}

function ServerOverviewCard({
  server,
  stats,
  onStart,
  onStop,
}: {
  server: ServerModel;
  stats: ReturnType<typeof useStatsStore.getState>["stats"][string]["latest"];
  onStart: () => void;
  onStop: () => void;
}) {
  const isActive = server.status === "running" || server.status === "starting";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Server className="h-4 w-4 shrink-0 text-copper" aria-hidden="true" />
            <h2 className="truncate font-display text-lg font-semibold">{server.name}</h2>
          </div>
          <p className="mt-1 text-sm capitalize text-muted">
            {server.software} {server.version} on port {server.port}
          </p>
        </div>
        <StatusBadge status={server.status} />
      </div>

      {stats && server.status === "running" ? (
        <div className="mt-4 grid grid-cols-4 gap-2 rounded-lg border border-border bg-surface-console px-3 py-3">
          <MiniMetric label="CPU" value={`${stats.cpu}%`} tone={stats.cpu > 80 ? "danger" : "good"} />
          <MiniMetric
            label="RAM"
            value={`${stats.ramMb} MB`}
            tone={stats.ramMb / server.ramMaxMb > 0.9 ? "danger" : "neutral"}
          />
          <MiniMetric label="TPS" value={stats.tps.toFixed(1)} tone={stats.tps < 18 ? "warn" : "good"} />
          <MiniMetric label="Players" value={stats.players} tone="info" />
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-rail px-3 py-3 text-sm text-muted">
          <TriangleAlert className="h-4 w-4 text-muted" aria-hidden="true" />
          Live metrics appear while the server is running.
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
          className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-rail px-3 text-xs font-semibold text-white transition-colors hover:border-copper/60 hover:bg-surface-3"
        >
          Open
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </Card>
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
