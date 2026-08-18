import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Package,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "../../lib/apiClient.js";
import { getSocket } from "../../lib/socket.js";
import { Button, IconButton } from "../ui/Button.js";
import { Alert, Card, EmptyState } from "../ui/Layout.js";
import { Field, Select, Switch, TextInput } from "../ui/Form.js";
import { InlineError, useError } from "../errors/ErrorProvider.js";
import type {
  AppError,
  InstalledPlugin,
  InstalledPluginListResponse,
  ModrinthProjectSearchHit,
  ModrinthSearchResponse,
  ModrinthVersion,
  ModrinthVersionListResponse,
  PluginCompatibility,
  PluginInstallProgressPayload,
  PluginInstallResponse,
  Server,
} from "@serverlab/shared";

interface PluginsPanelProps {
  server: Server;
}

const SORTS = [
  { value: "downloads", label: "Downloads" },
  { value: "relevance", label: "Relevance" },
  { value: "updated", label: "Recently updated" },
  { value: "newest", label: "Newest" },
];

export function PluginsPanel({ server }: PluginsPanelProps) {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("downloads");
  const [category, setCategory] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ModrinthProjectSearchHit[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [selectedProject, setSelectedProject] = useState<ModrinthProjectSearchHit | null>(null);
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [allowWarning, setAllowWarning] = useState(false);
  const [progress, setProgress] = useState<PluginInstallProgressPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [viewMode, setViewMode] = useState<"installed" | "browse">("installed");
  const { reportError } = useError();

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, versions]
  );
  const installedSelectedVersion = useMemo(
    () =>
      plugins.find(
        (plugin) =>
          plugin.source === "modrinth" &&
          plugin.status !== "trashed" &&
          plugin.sourceProjectId === selectedProject?.id &&
          (plugin.sourceVersionId === selectedVersion?.id ||
            plugin.installedVersion === selectedVersion?.versionNumber)
      ) ?? null,
    [plugins, selectedProject?.id, selectedVersion?.id, selectedVersion?.versionNumber]
  );
  const serverRunning = server.status === "running" || server.status === "starting";

  async function loadPlugins() {
    setPluginsLoading(true);
    setError(null);
    try {
      const data = await api.get<InstalledPluginListResponse>(`/api/servers/${server.id}/plugins`);
      setPlugins(data.plugins);
    } catch (err) {
      setError(
        reportError(err, {
          category: "plugin",
          severity: "error",
          userMessage: "ServerLab could not load installed plugins.",
          possibleSolution: "Refresh the list or check that the server folder still exists.",
          source: "renderer:plugins-panel",
          action: "load-plugins",
        })
      );
    } finally {
      setPluginsLoading(false);
    }
  }

  async function searchProjects({ append = false }: { append?: boolean } = {}) {
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        serverId: server.id,
        query,
        sort,
        offset: String(append ? results.length : 0),
        limit: "40",
      });
      if (category.trim()) params.set("category", category.trim());
      if (!append) {
        setSelectedProject(null);
        setVersions([]);
        setSelectedVersionId("");
      }
      const data = await api.get<ModrinthSearchResponse>(`/api/modrinth/search?${params.toString()}`);
      setResults((current) => {
        if (!append) return data.hits;
        const existingIds = new Set(current.map((project) => project.id));
        return [...current, ...data.hits.filter((project) => !existingIds.has(project.id))];
      });
      setTotalResults(data.totalHits);
      if (!append && data.hits[0]) void openProject(data.hits[0]);
    } catch (err) {
      setError(
        reportError(err, {
          category: "plugin",
          severity: "error",
          userMessage: "ServerLab could not search Modrinth.",
          possibleSolution: "Check your connection or retry with a different search.",
          source: "renderer:plugins-panel",
          action: "search-modrinth",
        })
      );
    } finally {
      setSearching(false);
    }
  }

  async function openProject(project: ModrinthProjectSearchHit) {
    setSelectedProject(project);
    setAllowWarning(false);
    setError(null);
    try {
      const data = await api.get<ModrinthVersionListResponse>(
        `/api/modrinth/projects/${project.id}/versions?serverId=${server.id}`
      );
      setVersions(data.versions);
      const best =
        data.versions.find((version) => version.compatibility?.status === "compatible") ??
        data.versions.find((version) => version.compatibility?.status === "warning") ??
        data.versions[0];
      setSelectedVersionId(best?.id ?? "");
    } catch (err) {
      setError(
        reportError(err, {
          category: "plugin",
          severity: "error",
          userMessage: "ServerLab could not load Modrinth versions.",
          possibleSolution: "Try the project again or check your connection.",
          source: "renderer:plugins-panel",
          action: "load-modrinth-versions",
        })
      );
    }
  }

  async function installSelected() {
    if (!selectedProject || !selectedVersion) return;
    setMessage(null);
    setError(null);
    const requestId = crypto.randomUUID();
    setProgress({
      jobId: requestId,
      serverId: server.id,
      pluginId: null,
      projectId: selectedProject.id,
      versionId: selectedVersion.id,
      action: "install",
      status: "queued",
      stage: "resolving-project",
      bytesReceived: 0,
      totalBytes: null,
      percent: 0,
      speedBytesPerSec: 0,
      etaSeconds: null,
    });
    try {
      const result = await api.post<PluginInstallResponse>(`/api/servers/${server.id}/plugins/install`, {
        projectId: selectedProject.id,
        versionId: selectedVersion.id,
        allowWarning,
        requestId,
      });
      setMessage(
        result.restartRequired
          ? `${selectedProject.title} installed. Restart this server when ready.`
          : `${selectedProject.title} installed.`
      );
      setProgress(null);
      setViewMode("installed");
      const installedPlugin = result.plugin;
      if (installedPlugin) {
        setPlugins((current) => [
          ...current.filter((plugin) => plugin.id !== installedPlugin.id),
          installedPlugin,
        ]);
      }
      await loadPlugins();
    } catch (err) {
      setError(
        reportError(err, {
          category: "plugin",
          severity: "error",
          userMessage: "ServerLab could not install this plugin.",
          possibleSolution: "Review compatibility, then retry the install.",
          source: "renderer:plugins-panel",
          action: "install-plugin",
        })
      );
    }
  }

  async function cancelProgress() {
    if (!progress) return;
    await api.post(`/api/servers/${server.id}/plugins/jobs/${progress.jobId}/cancel`);
    setProgress(null);
  }

  async function runPluginAction(plugin: InstalledPlugin, action: "update" | "disable" | "enable" | "restore" | "remove") {
    setMessage(null);
    setError(null);
    try {
      if (action === "remove") {
        await api.delete(`/api/servers/${server.id}/plugins/${plugin.id}`);
      } else {
        await api.post(`/api/servers/${server.id}/plugins/${plugin.id}/${action}`);
      }
      setMessage(
        serverRunning
          ? `${plugin.name} ${action}d. Restart this server when ready.`
          : `${plugin.name} ${action}d.`
      );
      await loadPlugins();
    } catch (err) {
      setError(
        reportError(err, {
          category: "plugin",
          severity: "error",
          userMessage: "ServerLab could not update this plugin.",
          possibleSolution: "Refresh the plugin list and try again.",
          source: "renderer:plugins-panel",
          action: `${action}-plugin`,
        })
      );
    }
  }

  useEffect(() => {
    void loadPlugins();
    void searchProjects();
    // Load the current server's plugin workspace when the tab mounts or the server changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportError, server.id]);

  useEffect(() => {
    let cleanup = () => {};
    getSocket().then((socket) => {
      const handler = (payload: PluginInstallProgressPayload) => {
        if (payload.serverId !== server.id) return;
        setProgress(payload);
        if (payload.status === "failed" && payload.error) {
          reportError(payload.error, {
            category: "plugin",
            userMessage: "The plugin operation failed.",
            possibleSolution: "Retry the operation or review the plugin compatibility details.",
            source: "renderer:plugins",
            action: `plugin-${payload.action}`,
          });
        }
        if (payload.status === "completed") {
          setViewMode("installed");
          void loadPlugins();
        }
        if (payload.status === "completed" || payload.status === "failed" || payload.status === "cancelled") {
          window.setTimeout(() => setProgress(null), 1200);
        }
      };
      socket.on("plugin:install-progress", handler);
      cleanup = () => socket.off("plugin:install-progress", handler);
    }).catch((error) => reportError(error, {
      category: "network",
      severity: "warning",
      userMessage: "Live plugin installation updates are unavailable.",
      possibleSolution: "Retry after the backend reconnects.",
      source: "renderer:plugins",
      action: "subscribe-plugin-progress",
    }));
    return () => cleanup();
    // loadPlugins is intentionally captured here so a completed socket job refreshes the installed list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportError, server.id]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex w-fit items-center gap-1 rounded border border-border bg-rail p-1" role="tablist" aria-label="Plugin workspace">
        <button type="button" role="tab" aria-selected={viewMode === "installed"} onClick={() => setViewMode("installed")} className={clsx("rounded px-3 py-1.5 text-xs font-semibold transition-colors", viewMode === "installed" ? "bg-copper text-carbon" : "text-muted hover:text-white")}>
          Installed <span className="ml-1 font-mono">{plugins.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={viewMode === "browse"} onClick={() => setViewMode("browse")} className={clsx("rounded px-3 py-1.5 text-xs font-semibold transition-colors", viewMode === "browse" ? "bg-copper text-carbon" : "text-muted hover:text-white")}>
          Browse Modrinth
        </button>
      </div>

      <div className="grid min-h-[620px] gap-4">
      <Card className={clsx("flex min-h-[520px] flex-col overflow-hidden", viewMode !== "installed" && "hidden")}>
        <div className="border-b border-border bg-carbon px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-white">Installed plugins</h2>
              <p className="mt-1 text-xs text-muted">{plugins.length} items in this server</p>
            </div>
            <IconButton icon={RefreshCw} label="Refresh plugins" onClick={loadPlugins} disabled={pluginsLoading} />
          </div>
        </div>

        {serverRunning && (
          <Alert tone="warning" className="m-3 mb-0">
            Plugin file changes usually need a server restart.
          </Alert>
        )}

        {message && (
          <Alert
            tone="success"
            className="m-3 mb-0"
            autoDismissMs={5000}
            dismissKey={message}
            onDismiss={() => setMessage(null)}
          >
            {message}
          </Alert>
        )}
        {error && <div className="m-3 mb-0"><InlineError error={error} /></div>}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {plugins.length === 0 && !pluginsLoading ? (
            <EmptyState
              icon={<Package className="h-10 w-10" aria-hidden="true" />}
              title="No plugins installed"
              description="Search Modrinth and install a compatible plugin for this server."
            />
          ) : (
            <div className="grid gap-2">
              {plugins.map((plugin) => (
                <PluginRow
                  key={plugin.id}
                  plugin={plugin}
                  onUpdate={() => runPluginAction(plugin, "update")}
                  onDisable={() => runPluginAction(plugin, "disable")}
                  onEnable={() => runPluginAction(plugin, "enable")}
                  onRestore={() => runPluginAction(plugin, "restore")}
                  onRemove={() => runPluginAction(plugin, "remove")}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className={clsx("flex min-h-[520px] flex-col overflow-hidden", viewMode !== "browse" && "hidden")}>
        <div className="border-b border-border bg-carbon px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchProjects();
                }}
                placeholder="Search Modrinth plugins"
                className="h-9 pl-9 text-sm"
              />
            </div>
            <Select value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 py-1 text-xs">
              {SORTS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
            <TextInput
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Category"
              className="h-9 text-xs"
            />
            <Button onClick={() => void searchProjects()} disabled={searching} icon={Search} variant="primary" size="sm">
              {searching ? "Searching" : "Search"}
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(220px,0.8fr)_minmax(300px,1.2fr)]">
          <div className="min-h-0 overflow-y-auto border-b border-border md:border-b-0 md:border-r">
            {results.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted">
                Search results appear here. Compatibility is shown on each result, so projects with
                incomplete version metadata are not hidden.
              </div>
            ) : (
              results.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => openProject(project)}
                  className={clsx(
                    "grid w-full gap-1 border-b border-border px-3 py-3 text-left transition-colors hover:bg-rail",
                    selectedProject?.id === project.id && "bg-rail"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-white">{project.title}</span>
                    <CompatibilityBadge compatibility={project.compatibility} />
                  </div>
                  <p className="line-clamp-2 text-xs leading-5 text-muted">{project.description}</p>
                  <p className="font-mono text-[0.68rem] text-muted">
                    {formatNumber(project.downloads)} downloads
                  </p>
                </button>
              ))
            )}
            {results.length > 0 && results.length < totalResults && (
              <div className="border-t border-border p-3">
                <Button
                  onClick={() => void searchProjects({ append: true })}
                  disabled={searching}
                  variant="secondary"
                  size="sm"
                  className="w-full"
                >
                  {searching ? "Loading results" : `Load more results (${results.length}/${totalResults})`}
                </Button>
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto p-4">
            {!selectedProject ? (
              <EmptyState
                icon={<Search className="h-10 w-10" aria-hidden="true" />}
                title="Choose a plugin"
                description="Select a Modrinth result to review versions and install it."
              />
            ) : (
              <div className="grid gap-4">
                <div className="flex items-start gap-3">
                  {selectedProject.iconUrl ? (
                    <img src={selectedProject.iconUrl} alt="" className="h-12 w-12 rounded border border-border" />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded border border-border bg-rail">
                      <Package className="h-5 w-5 text-copper" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-display text-lg font-semibold text-white">{selectedProject.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted">{selectedProject.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                      <span>{formatNumber(selectedProject.downloads)} downloads</span>
                      <span>{formatNumber(selectedProject.followers)} follows</span>
                      {selectedProject.license && <span>{selectedProject.license}</span>}
                    </div>
                  </div>
                  <a
                    href={`https://modrinth.com/plugin/${selectedProject.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-border text-muted hover:bg-rail hover:text-white"
                    aria-label="Open on Modrinth"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>

                <Field label="Version">
                  <Select value={selectedVersionId} onChange={(event) => setSelectedVersionId(event.target.value)}>
                    {versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.versionNumber} / {version.compatibility?.status ?? "unknown"}
                        {plugins.some(
                          (plugin) =>
                            plugin.source === "modrinth" &&
                            plugin.status !== "trashed" &&
                            plugin.sourceProjectId === selectedProject.id &&
                            (plugin.sourceVersionId === version.id ||
                              plugin.installedVersion === version.versionNumber)
                        )
                          ? " / installed"
                          : ""}
                      </option>
                    ))}
                  </Select>
                </Field>

                {installedSelectedVersion && (
                  <Alert tone="success">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        Version {installedSelectedVersion.installedVersion} is already installed on this server.
                        {installedSelectedVersion.status === "disabled" ? " It is currently disabled." : ""}
                      </span>
                    </div>
                  </Alert>
                )}

                {selectedVersion?.compatibility && (
                  <Alert tone={selectedVersion.compatibility.status === "compatible" ? "success" : selectedVersion.compatibility.status === "warning" ? "warning" : "danger"}>
                    {selectedVersion.compatibility.reason}
                  </Alert>
                )}

                {selectedVersion?.compatibility?.status === "warning" && (
                  <Switch
                    label="Install despite compatibility warning"
                    checked={allowWarning}
                    onChange={setAllowWarning}
                  />
                )}

                {selectedVersion?.dependencies.length ? (
                  <div className="rounded border border-border bg-surface-console px-3 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Dependencies</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedVersion.dependencies.map((dependency, index) => (
                        <span key={`${dependency.projectId ?? dependency.fileName}-${index}`} className="rounded border border-border bg-rail px-2 py-1 text-xs text-muted">
                          {dependency.dependencyType} {dependency.projectName ?? dependency.fileName ?? dependency.projectId ?? "Unknown dependency"}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {progress && (
                  <ProgressBlock progress={progress} onCancel={cancelProgress} />
                )}

                <Button
                  onClick={installSelected}
                  disabled={
                    !selectedVersion ||
                    Boolean(progress) ||
                    Boolean(installedSelectedVersion) ||
                    selectedVersion.compatibility?.status === "incompatible" ||
                    (selectedVersion.compatibility?.status === "warning" && !allowWarning)
                  }
                  icon={Download}
                  variant={installedSelectedVersion ? "secondary" : "primary"}
                >
                  {installedSelectedVersion
                    ? "Already installed"
                    : selectedVersion?.compatibility?.status === "warning"
                      ? "Install anyway"
                      : "Install plugin"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
      </div>
    </div>
  );
}

function PluginRow({
  plugin,
  onUpdate,
  onDisable,
  onEnable,
  onRestore,
  onRemove,
}: {
  plugin: InstalledPlugin;
  onUpdate: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onRestore: () => void;
  onRemove: () => void;
}) {
  const managed = plugin.source === "modrinth";
  return (
    <div className="rounded border border-border bg-rail px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-copper" />
            <p className="truncate font-semibold text-white">{plugin.name}</p>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-muted">{plugin.fileName}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[0.68rem]">
            <span className="rounded border border-border bg-panel px-2 py-0.5 text-muted">{plugin.installedVersion}</span>
            <span className="rounded border border-border bg-panel px-2 py-0.5 capitalize text-muted">{plugin.status}</span>
            <span className="rounded border border-border bg-panel px-2 py-0.5 capitalize text-muted">{plugin.source}</span>
          </div>
        </div>
        {managed && (
          <div className="flex flex-wrap gap-1">
            {plugin.status === "installed" && (
              <>
                <IconButton icon={RefreshCw} label="Update plugin" onClick={onUpdate} />
                <IconButton icon={Power} label="Disable plugin" onClick={onDisable} />
                <IconButton icon={Trash2} label="Remove plugin" variant="danger" onClick={onRemove} />
              </>
            )}
            {plugin.status === "disabled" && (
              <>
                <IconButton icon={Power} label="Enable plugin" onClick={onEnable} />
                <IconButton icon={Trash2} label="Remove plugin" variant="danger" onClick={onRemove} />
              </>
            )}
            {plugin.status === "trashed" && (
              <IconButton icon={RotateCcw} label="Restore plugin" onClick={onRestore} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CompatibilityBadge({ compatibility }: { compatibility: PluginCompatibility | null }) {
  if (!compatibility) return null;
  const classes = {
    compatible: "border-grass/40 bg-grass/10 text-grass",
    warning: "border-glowstone/40 bg-glowstone/10 text-glowstone",
    incompatible: "border-redstone/40 bg-redstone/10 text-redstone",
  }[compatibility.status];
  return (
    <span className={clsx("shrink-0 rounded border px-2 py-0.5 text-[0.65rem] font-semibold uppercase", classes)}>
      {compatibility.status}
    </span>
  );
}

function ProgressBlock({
  progress,
  onCancel,
}: {
  progress: PluginInstallProgressPayload;
  onCancel: () => void;
}) {
  return (
    <div className="rounded border border-border bg-surface-console px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold capitalize text-white">{progress.stage.replace(/-/g, " ")}</span>
        <span className="font-mono text-muted">{Math.round(progress.percent)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-rail">
        <div className="h-full rounded-full bg-copper transition-all" style={{ width: `${Math.min(100, progress.percent)}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{formatBytes(progress.bytesReceived)} / {progress.totalBytes ? formatBytes(progress.totalBytes) : "unknown"}</span>
        <span>{formatBytes(progress.speedBytesPerSec)}/s {progress.etaSeconds != null ? `/ ${progress.etaSeconds}s` : ""}</span>
        {progress.status === "running" && (
          <Button onClick={onCancel} variant="quiet" size="sm">Cancel</Button>
        )}
      </div>
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
}
