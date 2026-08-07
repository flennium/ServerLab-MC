import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Boxes, Folder, Plus, Server as ServerIcon } from "lucide-react";
import { useServerStore } from "../store/serverStore.js";
import { StatusBadge } from "../components/ui/StatusBadge.js";
import { ServerRowSkeleton } from "../components/ui/Skeleton.js";
import { CreateServerModal } from "../components/server/CreateServerModal.js";
import { Alert, Card, EmptyState, ManagementHeader } from "../components/ui/Layout.js";
import { Button } from "../components/ui/Button.js";
import { toHashPath } from "../lib/router.js";

export function ServersPage() {
  const { servers, fetchServers } = useServerStore();
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchServers()
      .catch((error) => setError(error instanceof Error ? error.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [fetchServers]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <ManagementHeader
        eyebrow="Server inventory"
        title="Servers"
        description="Manage every local server profile, runtime target, port, and control surface."
        actions={
          <Button onClick={() => setShowCreate(true)} icon={Plus} variant="primary">
            New server
          </Button>
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

      {loading ? (
        <div className="flex flex-col gap-2">
          <ServerRowSkeleton />
          <ServerRowSkeleton />
          <ServerRowSkeleton />
        </div>
      ) : servers.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-10 w-10" aria-hidden="true" />}
          title="No server profiles"
          description="Create a server profile to connect a folder, runtime settings, console, files, monitoring, and backups."
          action={
            <Button onClick={() => setShowCreate(true)} icon={Plus} variant="primary">
              Create server
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(160px,0.8fr)_120px_110px_120px] gap-4 border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted lg:grid">
            <span>Server</span>
            <span>Runtime</span>
            <span>Port</span>
            <span>Status</span>
            <span className="text-right">Open</span>
          </div>
          <div className="divide-y divide-border">
            {servers.map((server) => (
              <a
                key={server.id}
                href={toHashPath(`/servers/${encodeURIComponent(server.id)}`)}
                className="grid gap-3 px-4 py-4 transition-colors hover:bg-rail lg:grid-cols-[minmax(220px,1.4fr)_minmax(160px,0.8fr)_120px_110px_120px] lg:items-center lg:gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ServerIcon className="h-4 w-4 shrink-0 text-copper" aria-hidden="true" />
                    <span className="truncate font-display font-semibold text-white">
                      {server.name}
                    </span>
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                    <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate font-mono">{server.path}</span>
                  </div>
                </div>

                <div className="text-sm capitalize text-white">
                  {server.software} {server.version}
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {server.ramMinMb}-{server.ramMaxMb} MB
                  </p>
                </div>

                <div className="font-mono text-sm text-white">{server.port}</div>
                <StatusBadge status={server.status} className="w-fit" />
                <div className="flex items-center justify-end gap-2 text-sm font-semibold text-copper">
                  Open
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </div>
              </a>
            ))}
          </div>
        </Card>
      )}

      {showCreate && (
        <CreateServerModal
          onClose={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}
