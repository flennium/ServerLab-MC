import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Boxes, Folder, Plus, Search, Server as ServerIcon } from "lucide-react";
import { useServerStore } from "../store/serverStore.js";
import { StatusBadge } from "../components/ui/StatusBadge.js";
import { ServerRowSkeleton } from "../components/ui/Skeleton.js";
import { CreateServerModal } from "../components/server/CreateServerModal.js";
import { Alert, Card, EmptyState, ManagementHeader } from "../components/ui/Layout.js";
import { Button } from "../components/ui/Button.js";
import { TextInput } from "../components/ui/Form.js";
import { toHashPath } from "../lib/router.js";
import { reportError } from "../lib/errorStore.js";

export function ServersPage() {
  const { servers, fetchServers } = useServerStore();
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<"name" | "status" | "port">("status");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchServers()
      .catch((error) => setError(reportError(error, {
        category: "server",
        userMessage: "The server inventory could not be loaded.",
        possibleSolution: "Retry after the local backend is ready.",
        source: "renderer:servers",
        action: "load-servers",
      }).userMessage))
      .finally(() => setLoading(false));
  }, [fetchServers]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleServers = useMemo(() => {
    const statusWeight = { crashed: 0, starting: 1, running: 2, stopping: 3, stopped: 4 };
    const needle = query.trim().toLowerCase();
    return servers
      .filter((server) => {
        const matchesQuery = !needle || `${server.name} ${server.software} ${server.version} ${server.path}`.toLowerCase().includes(needle);
        return matchesQuery && (statusFilter === "all" || server.status === statusFilter);
      })
      .sort((left, right) => {
        if (sort === "name") return left.name.localeCompare(right.name);
        if (sort === "port") return left.port - right.port;
        return statusWeight[left.status] - statusWeight[right.status] || left.name.localeCompare(right.name);
      });
  }, [query, servers, sort, statusFilter]);

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
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden="true" />
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search servers"
                aria-label="Search servers"
                className="h-9 pl-9 text-xs"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter servers by status"
              className="h-9 rounded border border-border bg-rail px-3 text-xs text-white outline-none focus:border-copper"
            >
              <option value="all">All statuses</option>
              <option value="running">Running</option>
              <option value="starting">Starting</option>
              <option value="stopped">Stopped</option>
              <option value="crashed">Crashed</option>
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              aria-label="Sort servers"
              className="h-9 rounded border border-border bg-rail px-3 text-xs text-white outline-none focus:border-copper"
            >
              <option value="status">Sort: status</option>
              <option value="name">Sort: name</option>
              <option value="port">Sort: port</option>
            </select>
          </div>
          {visibleServers.length === 0 ? (
            <EmptyState
              icon={<Search className="h-9 w-9" aria-hidden="true" />}
              title="No matching servers"
              description="Try a different name, framework, version, or status filter."
              action={<Button onClick={() => { setQuery(""); setStatusFilter("all"); }} variant="secondary">Clear filters</Button>}
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
            {visibleServers.map((server) => (
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
                  <p className="mt-1 text-xs text-muted">Created {formatServerDate(server.createdAt)}</p>
                </div>

                <div className="text-sm capitalize text-white">
                  {server.software} {server.version}
                  <p className="mt-0.5 font-mono text-xs text-muted">
                    {server.ramMinMb}-{server.ramMaxMb} MB
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {server.javaRuntimeId ? "Managed Java" : "Manual Java"} · {server.autoStart ? "Auto-start on" : "Auto-start off"}
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
        </>
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

function formatServerDate(value: Date | string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
