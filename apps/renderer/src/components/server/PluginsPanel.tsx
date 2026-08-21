import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  ListFilter,
  Package,
  Power,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../lib/apiClient.js";
import { getSocket } from "../../lib/socket.js";
import { Button, IconButton } from "../ui/Button.js";
import { Alert, Card, EmptyState } from "../ui/Layout.js";
import { Field, Select, Switch, TextInput } from "../ui/Form.js";
import { Modal } from "../ui/Modal.js";
import { ConfirmModal } from "../ui/ConfirmModal.js";
import { InlineError, useError } from "../errors/ErrorProvider.js";
import type {
  AppError,
  InstalledPlugin,
  InstalledPluginListResponse,
  ModrinthProjectResponse,
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
  const completionTimers = useRef(new Set<number>());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [pendingInstall, setPendingInstall] = useState<ModrinthVersion | null>(null);
  const [includeOptionalDependencies, setIncludeOptionalDependencies] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<InstalledPlugin | null>(null);
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
  const pendingDependencies = useMemo(
    () => pendingInstall?.dependencies.filter((dependency) => dependency.projectId && (dependency.dependencyType === "required" || dependency.dependencyType === "optional")) ?? [],
    [pendingInstall]
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
      const [projectData, versionsData] = await Promise.all([
        api.get<ModrinthProjectResponse>(
          `/api/modrinth/projects/${project.id}?serverId=${server.id}`
        ),
        api.get<ModrinthVersionListResponse>(
          `/api/modrinth/projects/${project.id}/versions?serverId=${server.id}`
        ),
      ]);
      setSelectedProject({ ...project, ...projectData.project });
      setVersions(versionsData.versions);
      const best =
        versionsData.versions.find((version) => version.compatibility?.status === "compatible") ??
        versionsData.versions.find((version) => version.compatibility?.status === "warning") ??
        versionsData.versions[0];
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

  function installSelected() {
    if (!selectedProject || !selectedVersion) return;
    const downloadableDependencies = selectedVersion.dependencies.filter(
      (dependency) => dependency.projectId && (dependency.dependencyType === "required" || dependency.dependencyType === "optional")
    );
    if (downloadableDependencies.length > 0) {
      setIncludeOptionalDependencies(false);
      setPendingInstall(selectedVersion);
      return;
    }
    void performInstall(selectedVersion, "none");
  }

  async function performInstall(versionToInstall: ModrinthVersion, dependencyMode: "none" | "required" | "all") {
    if (!selectedProject) return;
    setMessage(null);
    setError(null);
    const requestId = crypto.randomUUID();
    setProgress({
      jobId: requestId,
      serverId: server.id,
      pluginId: null,
      projectId: selectedProject.id,
      versionId: versionToInstall.id,
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
        versionId: versionToInstall.id,
        allowWarning,
        dependencyMode,
        requestId,
      });
      const dependencyCount = result.installedDependencies?.length ?? 0;
      setMessage(
        `${selectedProject.title} installed${dependencyCount > 0 ? ` with ${dependencyCount} dependenc${dependencyCount === 1 ? "y" : "ies"}` : ""}.${result.restartRequired ? " Restart this server when ready." : ""}`
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

  async function runPluginAction(plugin: InstalledPlugin, action: "update" | "disable" | "enable") {
    setMessage(null);
    setError(null);
    try {
      await api.post(`/api/servers/${server.id}/plugins/${plugin.id}/${action}`);
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

  async function removePlugin(plugin: InstalledPlugin) {
    setMessage(null);
    setError(null);
    try {
      await api.delete(`/api/servers/${server.id}/plugins/${plugin.id}`);
      setPendingRemoval(null);
      setMessage(`${plugin.name} was permanently removed.`);
      await loadPlugins();
    } catch (err) {
      setError(
        reportError(err, {
          category: "plugin",
          severity: "error",
          userMessage: "ServerLab could not remove this plugin.",
          possibleSolution: "Refresh the plugin list and try again.",
          source: "renderer:plugins-panel",
          action: "remove-plugin",
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
    let disposed = false;
    const timerSet = completionTimers.current;
    getSocket().then((socket) => {
      if (disposed) return;
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
          const timer = window.setTimeout(() => {
            timerSet.delete(timer);
            setProgress(null);
          }, 1200);
          timerSet.add(timer);
        }
      };
      socket.on("plugin:install-progress", handler);
      cleanup = () => socket.off("plugin:install-progress", handler);
    }).catch((error) => {
      if (disposed) return;
      reportError(error, {
      category: "network",
      severity: "warning",
      userMessage: "Live plugin installation updates are unavailable.",
      possibleSolution: "Retry after the backend reconnects.",
      source: "renderer:plugins",
      action: "subscribe-plugin-progress",
      });
    });
    return () => {
      disposed = true;
      cleanup();
      timerSet.forEach((timer) => window.clearTimeout(timer));
      timerSet.clear();
    };
    // loadPlugins is intentionally captured here so a completed socket job refreshes the installed list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportError, server.id]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-rail p-1.5" role="tablist" aria-label="Plugin workspace">
        <div className="flex items-center gap-1">
          <button type="button" role="tab" aria-selected={viewMode === "installed"} onClick={() => setViewMode("installed")} className={clsx("rounded-md px-3 py-1.5 text-xs font-semibold transition-colors", viewMode === "installed" ? "bg-copper text-carbon" : "text-muted hover:text-white")}>
            Installed <span className="ml-1 font-mono">{plugins.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={viewMode === "browse"} onClick={() => setViewMode("browse")} className={clsx("rounded-md px-3 py-1.5 text-xs font-semibold transition-colors", viewMode === "browse" ? "bg-copper text-carbon" : "text-muted hover:text-white")}>
            Browse Modrinth
          </button>
        </div>
        <div className="flex items-center gap-2 px-2 text-[0.68rem] text-muted">
          <ListFilter className="h-3.5 w-3.5 text-copper" aria-hidden="true" />
          <span>{viewMode === "browse" ? `${totalResults ? formatNumber(totalResults) : "No"} matching plugins` : "Server plugin inventory"}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
      <Card className={clsx("flex h-full min-h-0 flex-col overflow-hidden", viewMode !== "installed" && "hidden")}>
        <div className="shrink-0 border-b border-border bg-carbon px-4 py-3">
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
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
                  onRemove={() => setPendingRemoval(plugin)}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className={clsx("grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden", viewMode !== "browse" && "hidden")}>
        <div className="shrink-0 border-b border-border bg-carbon px-4 py-3">
          <form
            className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void searchProjects();
            }}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchProjects();
                }}
                placeholder="Search Modrinth plugins"
                aria-label="Search Modrinth plugins"
                className="h-9 pl-9 pr-9 text-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1.5 grid h-6 w-6 place-items-center rounded text-muted hover:bg-rail hover:text-white"
                  aria-label="Clear plugin search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select aria-label="Sort plugin results" value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 py-1 text-xs">
              {SORTS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </Select>
            <TextInput
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Category"
              aria-label="Filter by plugin category"
              className="h-9 text-xs"
            />
            <Button type="submit" disabled={searching} icon={Search} variant="primary" size="sm">
              {searching ? "Searching" : "Search"}
            </Button>
          </form>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.68rem] text-muted">
            <span>Search official Modrinth plugin projects for this server.</span>
            <span className="font-mono">{results.length > 0 ? `${results.length} loaded` : "Ready"}</span>
          </div>
        </div>

        <div className="grid min-h-0 h-full grid-rows-[minmax(190px,0.8fr)_minmax(250px,1.2fr)] md:grid-cols-[minmax(220px,0.8fr)_minmax(300px,1.2fr)] md:grid-rows-1">
          <div className="min-h-0 overflow-y-auto overscroll-contain border-b border-border md:border-b-0 md:border-r">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface-console/95 px-4 py-2 text-[0.68rem] text-muted backdrop-blur">
              <span className="font-semibold uppercase tracking-[0.14em]">Plugin projects</span>
              <span className="font-mono">{results.length}/{totalResults || 0}</span>
            </div>
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
                    selectedProject?.id === project.id && "border-l-2 border-l-copper bg-rail"
                  )}
                  aria-current={selectedProject?.id === project.id ? "true" : undefined}
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

          <div className="min-h-0 overflow-hidden p-4">
            {!selectedProject ? (
              <EmptyState
                icon={<Search className="h-10 w-10" aria-hidden="true" />}
                title="Choose a plugin"
                description="Select a Modrinth result to review versions and install it."
              />
            ) : (
              <div className="grid gap-3">
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
                    <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted">{selectedProject.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                      {selectedProject.author && <span>by {selectedProject.author}</span>}
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

                <Field label="Version" hint={selectedVersion ? `${selectedVersion.files.length} downloadable file${selectedVersion.files.length === 1 ? "" : "s"}` : "Loading versions..."}>
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
                          <span className="mr-1 font-semibold capitalize text-white">{dependency.dependencyType}</span>
                          {dependency.projectName ?? dependency.fileName ?? "Unnamed dependency"}
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

      {pendingInstall && selectedProject && (
        <Modal title="Review plugin dependencies" onClose={() => setPendingInstall(null)}>
          <div className="grid gap-4">
            <p className="text-sm leading-6 text-muted">
              {selectedProject.title} declares dependencies. ServerLab will download them from Modrinth and install them into this server&apos;s plugins folder before the plugin.
            </p>
            <div className="grid gap-2 rounded border border-border bg-surface-console p-3">
              {pendingDependencies.map((dependency, index) => (
                <div key={`${dependency.projectId ?? dependency.fileName}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-white">{dependency.projectName ?? dependency.fileName ?? "Unnamed dependency"}</span>
                  <span className="shrink-0 text-xs font-semibold uppercase text-muted">{dependency.dependencyType}</span>
                </div>
              ))}
            </div>
            {pendingDependencies.some((dependency) => dependency.dependencyType === "optional") && (
              <Switch
                label="Also install optional dependencies"
                checked={includeOptionalDependencies}
                onChange={setIncludeOptionalDependencies}
              />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPendingInstall(null)}>Cancel</Button>
              <Button
                variant="primary"
                icon={Download}
                onClick={() => {
                  const version = pendingInstall;
                  setPendingInstall(null);
                  void performInstall(version, includeOptionalDependencies ? "all" : "required");
                }}
              >
                Install plugin and dependencies
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {pendingRemoval && (
        <ConfirmModal
          title={`Delete ${pendingRemoval.name}?`}
          message="This permanently deletes the plugin jar, its ServerLab record, and its dependency records. It cannot be restored from this screen. Make a server backup first if you may need the file later."
          confirmLabel="Delete permanently"
          danger
          onCancel={() => setPendingRemoval(null)}
          onConfirm={() => void removePlugin(pendingRemoval)}
        />
      )}
    </div>
  );
}

function PluginRow({
  plugin,
  onUpdate,
  onDisable,
  onEnable,
  onRemove,
}: {
  plugin: InstalledPlugin;
  onUpdate: () => void;
  onDisable: () => void;
  onEnable: () => void;
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
