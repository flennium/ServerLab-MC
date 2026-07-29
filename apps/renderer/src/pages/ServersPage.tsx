import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useServerStore } from "../store/serverStore.js";
import { StatusBadge } from "../components/ui/StatusBadge.js";
import { CreateServerModal } from "../components/server/CreateServerModal.js";

export function ServersPage() {
  const { servers, fetchServers } = useServerStore();
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

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

      <div className="flex flex-col gap-2">
        {servers.map((server) => (
          <Link
            key={server.id}
            to={`/servers/${server.id}`}
            className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3 hover:bg-surface-3 transition-colors"
          >
            <div>
              <span className="font-medium">{server.name}</span>
              <span className="ml-3 text-xs text-muted capitalize">
                {server.software} {server.version} · Port {server.port}
              </span>
            </div>
            <StatusBadge status={server.status} />
          </Link>
        ))}

        {servers.length === 0 && (
          <p className="py-12 text-center text-muted">
            No servers yet — click "+ New Server" to add one.
          </p>
        )}
      </div>

      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
