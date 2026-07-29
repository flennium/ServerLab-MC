import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useServerStore } from "../store/serverStore.js";
import { StatusBadge } from "../components/ui/StatusBadge.js";
import { ServerRowSkeleton } from "../components/ui/Skeleton.js";
import { CreateServerModal } from "../components/server/CreateServerModal.js";

export function ServersPage() {
  const { servers, fetchServers } = useServerStore();
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetchServers()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Servers</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          + New Server
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger flex items-center justify-between">
          {error}
          <button onClick={load} className="underline hover:no-underline">Retry</button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {loading ? (
          [1, 2, 3].map((i) => <ServerRowSkeleton key={i} />)
        ) : servers.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface-2 p-10 text-center">
            <p className="text-4xl mb-3">⬡</p>
            <p className="mb-1 font-medium">No servers yet</p>
            <p className="text-sm text-muted">Click "+ New Server" to create your first one.</p>
          </div>
        ) : (
          servers.map((server) => (
            <Link
              key={server.id}
              to={`/servers/${server.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3 hover:bg-surface-3 transition-colors group"
            >
              <div className="min-w-0">
                <span className="font-medium">{server.name}</span>
                <span className="ml-3 text-xs text-muted capitalize">
                  {server.software} {server.version} · Port {server.port}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={server.status} />
                <span className="text-muted text-xs group-hover:text-white transition-colors">→</span>
              </div>
            </Link>
          ))
        )}
      </div>

      {showCreate && <CreateServerModal onClose={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}
