import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useServerStore } from "../store/serverStore.js";
import { StatusBadge } from "../components/ui/StatusBadge.js";

export function DashboardPage() {
  const { servers, fetchServers, startServer, stopServer } = useServerStore();

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

      {servers.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-2 p-8 text-center text-muted">
          <p className="mb-3 text-base">No servers yet.</p>
          <Link
            to="/servers"
            className="text-sm text-accent hover:underline"
          >
            Create your first server →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {servers.map((server) => (
            <motion.div
              key={server.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold">{server.name}</h2>
                  <p className="mt-0.5 text-xs text-muted capitalize">
                    {server.software} {server.version}
                  </p>
                </div>
                <StatusBadge status={server.status} />
              </div>

              <div className="flex gap-2">
                {server.status === "stopped" || server.status === "crashed" ? (
                  <button
                    onClick={() => startServer(server.id)}
                    className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
                  >
                    Start
                  </button>
                ) : (
                  <button
                    onClick={() => stopServer(server.id)}
                    className="rounded bg-surface-3 px-3 py-1.5 text-xs font-medium text-white hover:bg-border transition-colors"
                  >
                    Stop
                  </button>
                )}
                <Link
                  to={`/servers/${server.id}`}
                  className="rounded bg-surface-3 px-3 py-1.5 text-xs font-medium text-white hover:bg-border transition-colors"
                >
                  Open
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
