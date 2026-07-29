import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useServerStore } from "../store/serverStore.js";
import { useStatsStore } from "../store/statsStore.js";
import { StatusBadge } from "../components/ui/StatusBadge.js";
import { ServerCardSkeleton } from "../components/ui/Skeleton.js";

export function DashboardPage() {
  const { servers, fetchServers, startServer, stopServer } = useServerStore();
  const { getStats } = useStatsStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchServers()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load servers"))
      .finally(() => setLoading(false));
  }, [fetchServers]);

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => <ServerCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
          <button
            onClick={() => { setError(null); setLoading(true); fetchServers().finally(() => setLoading(false)); }}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <span className="text-sm text-muted">
          {servers.filter((s) => s.status === "running").length} / {servers.length} running
        </span>
      </div>

      {servers.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-2 p-10 text-center">
          <p className="text-4xl mb-3">⬡</p>
          <p className="mb-1 font-medium">No servers yet</p>
          <p className="mb-4 text-sm text-muted">Add your first Minecraft server to get started.</p>
          <Link
            to="/servers"
            className="inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
          >
            Create a server
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {servers.map((server) => {
            const stats = getStats(server.id);
            const live = stats.latest;
            return (
              <motion.div
                key={server.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{server.name}</h2>
                    <p className="mt-0.5 text-xs text-muted capitalize">
                      {server.software} {server.version}
                    </p>
                  </div>
                  <StatusBadge status={server.status} className="shrink-0 ml-2" />
                </div>

                {/* Live metrics row (only when running + data available) */}
                {live && server.status === "running" && (
                  <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-surface-3 px-3 py-2">
                    <Metric label="CPU" value={`${live.cpu}%`} warn={live.cpu > 80} />
                    <Metric label="RAM" value={`${live.ramMb}MB`} warn={live.ramMb / server.ramMaxMb > 0.9} />
                    <Metric label="TPS" value={live.tps.toFixed(1)} warn={live.tps < 18} />
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  {server.status === "stopped" || server.status === "crashed" ? (
                    <button
                      onClick={() => startServer(server.id)}
                      className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
                    >
                      ▶ Start
                    </button>
                  ) : (
                    <button
                      onClick={() => stopServer(server.id)}
                      className="rounded bg-surface-3 px-3 py-1.5 text-xs font-medium hover:bg-border transition-colors"
                    >
                      ⏹ Stop
                    </button>
                  )}
                  <Link
                    to={`/servers/${server.id}`}
                    className="rounded bg-surface-3 px-3 py-1.5 text-xs font-medium hover:bg-border transition-colors"
                  >
                    Open →
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xs font-semibold tabular-nums ${warn ? "text-warning" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
