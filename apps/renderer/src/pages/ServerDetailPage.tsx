import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  RotateCcw,
  Save,
  Server,
  ShieldAlert,
  Square,
  Trash2,
} from "lucide-react";
import { useServerStore } from "../store/serverStore.js";
import { StatusBadge } from "../components/ui/StatusBadge.js";
import { ConfirmModal } from "../components/ui/ConfirmModal.js";
import { Skeleton } from "../components/ui/Skeleton.js";
import { api } from "../lib/apiClient.js";
import { getSocket } from "../lib/socket.js";
import { reportError } from "../lib/errorStore.js";
import {
  Alert,
  Card,
  DangerZone,
  EmptyState,
  StatTile,
} from "../components/ui/Layout.js";
import { ActionBar } from "../components/ui/ActionBar.js";
import { Button } from "../components/ui/Button.js";
import { Field, LabelValue, Select, Switch, TextInput } from "../components/ui/Form.js";
import { PortField } from "../components/server/PortField.js";
import { Tabs } from "../components/ui/Tabs.js";
import { navigate } from "../lib/router.js";
import type {
  JavaRuntime,
  JavaRuntimeListResponse,
  JavaRecommendationResponse,
  PortCheckResponse,
  PortStatus,
  Server as ServerModel,
  ServerDeleteProgressPayload,
  UpdateServerDto,
} from "@serverlab/shared";

type Tab = "console" | "files" | "plugins" | "monitor" | "backups" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "console", label: "Console" },
  { id: "files", label: "Files" },
  { id: "plugins", label: "Plugins" },
  { id: "monitor", label: "Monitor" },
  { id: "backups", label: "Backups" },
  { id: "settings", label: "Settings" },
];

const Console = lazy(() =>
  import("../components/server/Console.js").then((module) => ({
    default: module.Console,
  }))
);
const ServerFileWorkspace = lazy(() =>
  import("../components/server/ServerFileWorkspace.js").then((module) => ({
    default: module.ServerFileWorkspace,
  }))
);
const PluginsPanel = lazy(() =>
  import("../components/server/PluginsPanel.js").then((module) => ({
    default: module.PluginsPanel,
  }))
);
const PerformanceMonitor = lazy(() =>
  import("../components/server/PerformanceMonitor.js").then((module) => ({
    default: module.PerformanceMonitor,
  }))
);
const BackupPanel = lazy(() =>
  import("../components/server/BackupPanel.js").then((module) => ({
    default: module.BackupPanel,
  }))
);

export function ServerDetailPage({ serverId }: { serverId: string }) {
  const { servers, fetchServers, startServer, stopServer, restartServer, deleteServer } =
    useServerStore();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("console");
  const [detailPortStatus, setDetailPortStatus] = useState<PortStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteState, setDeleteState] = useState<{
    running: boolean;
    percent: number;
    message: string;
    error: string | null;
  }>({ running: false, percent: 0, message: "Preparing deletion...", error: null });
  const [lifecycleAction, setLifecycleAction] = useState<"start" | "stop" | "restart" | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    fetchServers()
      .catch((error) => reportError(error, {
        category: "server",
        userMessage: "The server details could not be loaded.",
        possibleSolution: "Retry after the local backend is ready.",
        source: "renderer:server-detail",
        action: "load-server-detail",
      }))
      .finally(() => setLoading(false));
  }, [fetchServers]);

  const server = servers.find((server) => server.id === serverId);
  const currentServerPort = server?.port;
  const currentServerId = server?.id;

  useEffect(() => {
    if (server?.software === "vanilla" && tab === "plugins") setTab("console");
  }, [server?.software, tab]);

  useEffect(() => {
    if (!currentServerId || !currentServerPort) return;
    const query = new URLSearchParams({
      port: String(currentServerPort),
      excludeServerId: currentServerId,
    });
    api
      .get<PortCheckResponse>(`/api/ports/check?${query.toString()}`)
      .then(({ status }) => setDetailPortStatus(status))
      .catch((error) => {
        setDetailPortStatus(null);
        reportError(error, {
          category: "network",
          severity: "warning",
          userMessage: "Port status could not be checked.",
          possibleSolution: "Refresh the server page to check it again.",
          source: "renderer:server-detail",
          action: "check-server-port",
        });
      });
  }, [currentServerId, currentServerPort]);

  useEffect(() => {
    let cleanup = () => {};
    let disposed = false;

    getSocket().then((socket) => {
      if (disposed) return;
      const handler = (payload: ServerDeleteProgressPayload) => {
        if (payload.serverId !== serverId) return;
        if (payload.status === "failed") {
          reportError(payload.error ?? payload.message, {
            category: "server",
            userMessage: "Server deletion failed.",
            possibleSolution: "Review the server files and try deleting again.",
            source: "renderer:server-detail",
            action: "delete-server",
          });
        }
        setDeleteState({
          running: payload.status === "running",
          percent: payload.percent,
          message: payload.error ?? payload.message,
          error: payload.status === "failed" ? (payload.error ?? payload.message) : null,
        });
      };
      socket.on("server:delete-progress", handler);
      cleanup = () => socket.off("server:delete-progress", handler);
    }).catch((error) => {
      if (disposed) return;
      reportError(error, {
      category: "network",
      severity: "warning",
      userMessage: "Live server deletion progress is unavailable.",
      possibleSolution: "Retry after the backend reconnects.",
      source: "renderer:server-detail",
      action: "subscribe-delete-progress",
      });
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [serverId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <EmptyState
        icon={<Server className="h-10 w-10" aria-hidden="true" />}
        title="Server not found"
        description="The selected server profile is not available in the local inventory."
        action={
          <Button onClick={() => navigate("/servers")} icon={ArrowLeft} variant="primary">
            Back to servers
          </Button>
        }
      />
    );
  }

  const isTransitioning = server.status === "starting" || server.status === "stopping";
  const isProxy = server.kind === "proxy" || ["velocity", "waterfall", "bungeecord"].includes(server.software);

  async function runLifecycleAction(action: "start" | "stop" | "restart") {
    if (lifecycleAction || isTransitioning) return;
    setLifecycleAction(action);
    try {
      if (action === "start") await startServer(serverId);
      if (action === "stop") await stopServer(serverId);
      if (action === "restart") await restartServer(serverId);
    } catch (error) {
      reportError(error, {
        category: "server",
        severity: "error",
        userMessage: action === "stop"
          ? "The server stop request could not be completed."
          : action === "restart"
            ? "The server could not be restarted."
            : "The server could not be started.",
        possibleSolution: "Wait for the current server state to settle, then refresh and try again.",
        source: "renderer:server-detail",
        action: `${action}-server`,
      });
      await fetchServers().catch(() => {});
    } finally {
      setLifecycleAction(null);
    }
  }
  async function handleDelete() {
    setDeleteState({
      running: true,
      percent: 0,
      message: "Preparing deletion...",
      error: null,
    });
    try {
      await deleteServer(serverId);
      navigate("/servers");
    } catch (error) {
      const appError = reportError(error, {
        category: "server",
        userMessage: "The server could not be deleted.",
        possibleSolution: "Stop the server and try deletion again.",
        source: "renderer:server-detail",
        action: "delete-server",
      });
      setDeleteState({
        running: false,
        percent: 0,
        message: appError.userMessage,
        error: appError.userMessage,
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ActionBar
        className="shrink-0"
        eyebrow="Server deck"
        title={server.name}
        status={<StatusBadge status={server.status} />}
        description={`${isProxy ? "Proxy · " : ""}${server.software} ${server.version} / ${isProxy ? "listener" : "port"} ${server.port}`}
         primaryActions={
           <>
             {server.status === "running" ? (
               <>
                 <Button
                   onClick={() => void runLifecycleAction("stop")}
                   icon={Square}
                   variant="secondary"
                   size="sm"
                   disabled={Boolean(lifecycleAction)}
                 >
                   {lifecycleAction === "stop" ? "Stopping..." : "Stop"}
                 </Button>
                 <Button
                   onClick={() => void runLifecycleAction("restart")}
                   icon={RotateCcw}
                   variant="secondary"
                   size="sm"
                   disabled={Boolean(lifecycleAction)}
                 >
                   {lifecycleAction === "restart" ? "Restarting..." : "Restart"}
                 </Button>
               </>
             ) : server.status === "starting" ? (
               <Button disabled icon={Play} variant="primary" size="sm">Starting...</Button>
             ) : server.status === "stopping" ? (
               <Button disabled icon={Square} variant="secondary" size="sm">Stopping...</Button>
             ) : (
               <Button
                 onClick={() => void runLifecycleAction("start")}
                 icon={Play}
                 variant="primary"
                 size="sm"
                 disabled={Boolean(lifecycleAction)}
               >
                 {lifecycleAction === "start" ? "Starting..." : "Start"}
               </Button>
             )}
           </>
         }
      >

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatTile label="RAM min" value={`${server.ramMinMb}`} detail="MB" className="py-2.5" />
            <StatTile label="RAM max" value={`${server.ramMaxMb}`} detail="MB" tone="info" className="py-2.5" />
            <StatTile
              label={isProxy ? "Listener" : "Port"}
              value={server.port}
              detail={detailPortStatus?.available === false ? "conflict" : "ready"}
              tone={detailPortStatus?.available === false ? "warn" : "neutral"}
              className="py-2.5"
            />
            <StatTile
              label="Auto-start"
              value={server.autoStart ? "On" : "Off"}
              tone={server.autoStart ? "good" : "neutral"}
              className="py-2.5"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-carbon/60 px-3 py-2">
            <p className="min-w-0 truncate font-mono text-xs text-muted">{server.path}</p>
            <span className="shrink-0 text-xs text-muted">Created {formatServerDate(server.createdAt)}</span>
          </div>

          <Tabs
            items={server.software === "vanilla" ? TABS.filter((item) => item.id !== "plugins") : TABS}
            value={tab}
            onChange={setTab}
            label="Server sections"
          />
      </ActionBar>

      <div
        className={clsx(
          "min-h-0 flex-1 overscroll-contain pr-1",
          tab === "console" ? "overflow-hidden" : "overflow-y-auto"
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            className={clsx(
              "relative z-0",
              tab === "console" ? "h-full min-h-0" : "min-h-full"
            )}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
          >
            <Suspense
              fallback={
                <Skeleton
                  className={tab === "console" ? "h-full min-h-0 w-full" : "h-64 w-full"}
                />
              }
            >
              {tab === "console" && (
                <Console serverId={server.id} serverStatus={server.status} />
              )}

              {tab === "files" && (
                <ServerFileWorkspace
                  serverId={server.id}
                  serverPath={server.path}
                  serverStatus={server.status}
                />
              )}

              {tab === "plugins" && server.software !== "vanilla" && <PluginsPanel server={server} />}

              {tab === "monitor" && (isProxy ? <Alert tone="info">Proxy profiles expose listener and process status. Minecraft TPS and world metrics are not applicable.</Alert> : <PerformanceMonitor serverId={server.id} ramMaxMb={server.ramMaxMb} />)}

              {tab === "backups" && <BackupPanel serverId={server.id} />}

              {tab === "settings" && (
                <ServerSettings server={server} onDeleteServer={() => setConfirmDelete(true)} />
              )}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${server.name}"?`}
          message={
            deleteState.error ??
            "ServerLab will stop the server, take a safety backup, remove metadata, and delete the server folder. This cannot be undone."
          }
          confirmLabel="Delete server"
          loading={deleteState.running}
          progress={deleteState.percent}
          statusText={deleteState.message}
          danger
          onConfirm={handleDelete}
          onCancel={() => {
            if (!deleteState.running) setConfirmDelete(false);
          }}
        />
      )}
    </div>
  );
}

function ServerSettings({
  server,
  onDeleteServer,
}: {
  server: ServerModel;
  onDeleteServer: () => void;
}) {
  const { fetchServers } = useServerStore();
  const [form, setForm] = useState<UpdateServerDto>({
    name: server.name,
    javaPath: server.javaPath,
    javaRuntimeId: server.javaRuntimeId,
    javaOverrideMode: server.javaOverrideMode,
    allowUnsupportedJava: server.allowUnsupportedJava,
    ramMinMb: server.ramMinMb,
    ramMaxMb: server.ramMaxMb,
    port: server.port,
    bindAddress: server.bindAddress,
    targetMinecraftVersion: server.targetMinecraftVersion,
    startupArgs: server.startupArgs ?? "",
    autoStart: server.autoStart,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimes, setRuntimes] = useState<JavaRuntime[]>([]);
  const [recommendation, setRecommendation] = useState<JavaRecommendationResponse | null>(
    null
  );
  const [portStatus, setPortStatus] = useState<PortStatus | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const manualJava = form.javaOverrideMode === "manual";
  const selectedRuntime = useMemo(
    () => runtimes.find((runtime) => runtime.id === form.javaRuntimeId) ?? null,
    [form.javaRuntimeId, runtimes]
  );
  const runtimeIssue = useMemo(() => {
    if (manualJava) {
      return form.javaPath?.trim()
        ? null
        : "Enter a Java executable path or return to managed runtime selection.";
    }
    if (!selectedRuntime) return "Select a Java runtime before saving.";
    if (!recommendation) return null;
    if (selectedRuntime.major < recommendation.requiredMajor) {
      return `Java ${recommendation.requiredMajor} is required for ${server.software} ${server.version}.`;
    }
    if (
      server.software !== "waterfall" &&
      selectedRuntime.major > recommendation.requiredMajor &&
      !form.allowUnsupportedJava
    ) {
      return `Java ${selectedRuntime.major} is newer than the recommended Java ${recommendation.requiredMajor}. Enable unsupported Java only if you want this override.`;
    }
    return null;
  }, [
    form.allowUnsupportedJava,
    form.javaPath,
    manualJava,
    recommendation,
    selectedRuntime,
    server.software,
    server.version,
  ]);

  useEffect(() => {
    setForm({
      name: server.name,
      javaPath: server.javaPath,
      javaRuntimeId: server.javaRuntimeId,
      javaOverrideMode: server.javaOverrideMode,
      allowUnsupportedJava: server.allowUnsupportedJava,
      ramMinMb: server.ramMinMb,
      ramMaxMb: server.ramMaxMb,
      port: server.port,
      bindAddress: server.bindAddress,
      targetMinecraftVersion: server.targetMinecraftVersion,
      startupArgs: server.startupArgs ?? "",
      autoStart: server.autoStart,
    });
  }, [server]);

  useEffect(() => {
    setRuntimeLoading(true);
    Promise.all([
      api.get<JavaRuntimeListResponse>("/api/java/runtimes"),
      api.get<JavaRecommendationResponse>(
        `/api/java/recommendation?serverId=${encodeURIComponent(server.id)}&minecraftVersion=${encodeURIComponent(server.version)}&software=${server.software}`
      ),
    ])
      .then(([runtimeResponse, recommendationResponse]) => {
        setRuntimes(
          runtimeResponse.runtimes.filter((runtime) => runtime.status === "valid")
        );
        setRecommendation(recommendationResponse);
      })
      .catch((error) =>
        setError(reportError(error, {
          category: "java",
          userMessage: "Java runtimes could not be loaded.",
          possibleSolution: "Open Java Runtime Center and retry the scan.",
          source: "renderer:server-settings",
          action: "load-java-runtimes",
        }).userMessage)
      )
      .finally(() => setRuntimeLoading(false));
  }, [server.id, server.software, server.version]);

  useEffect(() => {
    if (manualJava || form.javaRuntimeId || !recommendation?.compatibleRuntime) return;
    setForm((current) => ({
      ...current,
      javaRuntimeId: recommendation.compatibleRuntime?.id ?? current.javaRuntimeId,
      javaPath: recommendation.compatibleRuntime?.executablePath ?? current.javaPath,
    }));
  }, [form.javaRuntimeId, manualJava, recommendation]);

  function set<K extends keyof UpdateServerDto>(key: K, value: UpdateServerDto[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (runtimeIssue) {
      setError(runtimeIssue);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/servers/${server.id}`, {
        name: form.name,
        ramMinMb: form.ramMinMb,
        ramMaxMb: form.ramMaxMb,
        port: form.port,
        bindAddress: form.bindAddress,
        targetMinecraftVersion: form.targetMinecraftVersion,
        startupArgs: form.startupArgs,
        autoStart: form.autoStart,
      });
      await api.patch(`/api/servers/${server.id}/java-runtime`, {
        javaRuntimeId: manualJava ? null : form.javaRuntimeId,
        javaPath: form.javaPath,
        javaOverrideMode: form.javaOverrideMode,
        allowUnsupportedJava: form.allowUnsupportedJava,
      });
      await fetchServers();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      setError(reportError(error, {
        category: "server",
        userMessage: "Server settings could not be saved.",
        possibleSolution: "Review the port and Java runtime, then try again.",
        source: "renderer:server-settings",
        action: "save-server-settings",
      }).userMessage);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="w-full max-w-5xl p-4 sm:p-5">
      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold">Runtime settings</h2>
        <p className="mt-1 text-sm text-muted">
          Changes apply to this server profile and are saved locally.
        </p>
      </div>

      <div className="grid min-w-0 gap-4">
        <Field label="Name">
          <TextInput
            type="text"
            value={form.name ?? ""}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="RAM min (MB)">
            <TextInput
              type="number"
              value={form.ramMinMb}
              onChange={(event) => set("ramMinMb", Number(event.target.value))}
              min={512}
            />
          </Field>
          <Field label="RAM max (MB)">
            <TextInput
              type="number"
              value={form.ramMaxMb}
              onChange={(event) => set("ramMaxMb", Number(event.target.value))}
              min={512}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PortField
            value={form.port}
            onChange={(port) => set("port", port)}
            excludeServerId={server.id}
            onStatusChange={setPortStatus}
            hint={
              server.status === "running" || server.status === "starting"
                ? "Port changes apply after restart."
                : "ServerLab checks saved servers and active OS ports before saving."
            }
          />
          <Field label="Java runtime">
            <Select
              value={form.javaRuntimeId ?? ""}
              disabled={manualJava}
              onChange={(event) => {
                const runtime = runtimes.find((item) => item.id === event.target.value);
                set("javaRuntimeId", event.target.value || null);
                if (runtime) set("javaPath", runtime.executablePath);
              }}
            >
              <option value="">
                {runtimeLoading ? "Loading runtimes..." : "Select runtime"}
              </option>
              {runtimes.map((runtime) => (
                <option key={runtime.id} value={runtime.id}>
                  Java {runtime.major} - {runtime.distribution} - {runtime.source}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {server.kind === "proxy" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Bind address">
              <TextInput
                value={form.bindAddress ?? "0.0.0.0"}
                onChange={(event) => set("bindAddress", event.target.value)}
              />
            </Field>
            <Field label="Target Minecraft version" hint="Used for proxy plugin compatibility.">
              <TextInput
                value={form.targetMinecraftVersion ?? ""}
                onChange={(event) => set("targetMinecraftVersion", event.target.value || null)}
                placeholder="Optional"
              />
            </Field>
          </div>
        )}

        {server.kind === "proxy" && server.configurationState !== "ready" && (
          <Alert tone="warning">
            Proxy configuration needs setup. Open the configuration file in Files, then restart after saving.
          </Alert>
        )}

        <div className="grid min-w-0 gap-4 rounded-lg border border-border bg-surface-console p-4 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-copper" aria-hidden="true" />
              <h3 className="font-display text-sm font-semibold text-white">
                Compatibility
              </h3>
            </div>
            <div className="grid min-w-0 gap-2">
              <LabelValue label="Server" value={`${server.software} ${server.version}`} />
              <LabelValue
                label="Required Java"
                value={
                  recommendation ? `Java ${recommendation.requiredMajor}` : "Checking..."
                }
              />
              <LabelValue
                label="Confidence"
                value={recommendation?.confidence ?? "Unknown"}
              />
              <LabelValue
                label="Detection method"
                value={recommendation?.detection?.method ?? "Provider/version fallback"}
              />
            </div>
          </div>
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-grass" aria-hidden="true" />
              <h3 className="font-display text-sm font-semibold text-white">
                Selected runtime
              </h3>
            </div>
            {manualJava ? (
              <p className="break-all font-mono text-xs leading-5 text-muted">
                {form.javaPath?.trim() || "No manual executable selected"}
              </p>
            ) : selectedRuntime ? (
              <div className="grid min-w-0 gap-2">
                <LabelValue
                  label="Version"
                  value={`Java ${selectedRuntime.major} (${selectedRuntime.version})`}
                />
                <LabelValue label="Distribution" value={selectedRuntime.distribution} />
                <LabelValue label="Source" value={selectedRuntime.source} />
              </div>
            ) : (
              <p className="text-sm text-muted">No runtime selected.</p>
            )}
          </div>
        </div>

        {recommendation?.warnings.map((warning) => (
          <Alert key={warning} tone="warning">
            {warning}
          </Alert>
        ))}

        <div className="rounded-lg border border-border bg-surface-console px-3 py-3">
          <Switch
            label="Use manual Java path"
            checked={manualJava}
            onChange={(checked) =>
              set("javaOverrideMode", checked ? "manual" : "automatic")
            }
          />
        </div>

        {manualJava && (
          <Field
            label="Manual Java executable"
            hint="Use this only when the runtime is managed outside ServerLab. ServerLab will validate the path before startup."
            required
          >
            <TextInput
              type="text"
              value={form.javaPath ?? ""}
              onChange={(event) => set("javaPath", event.target.value)}
            />
          </Field>
        )}

        <div className="rounded-lg border border-border bg-surface-console px-3 py-3">
          <Switch
            label="Allow newer unsupported Java"
            checked={form.allowUnsupportedJava ?? false}
            onChange={(checked) => set("allowUnsupportedJava", checked)}
          />
        </div>

        <Field label="Extra startup arguments">
          <TextInput
            type="text"
            value={form.startupArgs ?? ""}
            onChange={(event) => set("startupArgs", event.target.value)}
            placeholder="--nogui"
          />
        </Field>

        <div className="rounded-lg border border-border bg-surface-console px-3 py-3">
          <Switch
            label="Auto-start on app launch"
            checked={form.autoStart ?? false}
            onChange={(checked) => set("autoStart", checked)}
          />
        </div>

        {error && (
          <Alert
            tone="danger"
            autoDismissMs={8000}
            dismissKey={error}
            onDismiss={() => setError(null)}
          >
            {error}
          </Alert>
        )}
        {runtimeIssue && <Alert tone="warning">{runtimeIssue}</Alert>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || Boolean(runtimeIssue) || portStatus?.available === false}
            icon={Save}
            variant="primary"
          >
            {saving ? "Saving..." : "Save changes"}
          </Button>
          {saved && <span className="text-sm font-semibold text-grass">Saved</span>}
        </div>

        <DangerZone
          title="Delete server"
          description="Stops the server, creates a safety backup, removes metadata, and deletes the server folder."
        >
          <Button onClick={onDeleteServer} icon={Trash2} variant="danger">
            Delete server
          </Button>
        </DangerZone>
      </div>
    </Card>
  );
}

function formatServerDate(value: Date | string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
