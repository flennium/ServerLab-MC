import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import {
  Alert,
  Card,
  EmptyState,
  PageHeader,
  StatTile,
} from "../components/ui/Layout.js";
import { Button } from "../components/ui/Button.js";
import { Field, LabelValue, Select, Switch, TextInput } from "../components/ui/Form.js";
import { Tabs } from "../components/ui/Tabs.js";
import { navigate } from "../lib/router.js";
import type {
  JavaRuntime,
  JavaRuntimeListResponse,
  JavaRecommendationResponse,
  Server as ServerModel,
  ServerDeleteProgressPayload,
  UpdateServerDto,
} from "@serverlab/shared";

type Tab = "console" | "files" | "monitor" | "backups" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "console", label: "Console" },
  { id: "files", label: "Files" },
  { id: "monitor", label: "Monitor" },
  { id: "backups", label: "Backups" },
  { id: "settings", label: "Settings" },
];

const Console = lazy(() =>
  import("../components/server/Console.js").then((module) => ({
    default: module.Console,
  }))
);
const FileManager = lazy(() =>
  import("../components/server/FileManager.js").then((module) => ({
    default: module.FileManager,
  }))
);
const FileEditor = lazy(() =>
  import("../components/server/FileEditor.js").then((module) => ({
    default: module.FileEditor,
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

interface OpenFile {
  path: string;
  name: string;
}

export function ServerDetailPage({ serverId }: { serverId: string }) {
  const { servers, fetchServers, startServer, stopServer, restartServer, deleteServer } =
    useServerStore();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("console");
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteState, setDeleteState] = useState<{
    running: boolean;
    percent: number;
    message: string;
    error: string | null;
  }>({ running: false, percent: 0, message: "Preparing deletion...", error: null });

  useEffect(() => {
    fetchServers().finally(() => setLoading(false));
  }, [fetchServers]);

  const server = servers.find((server) => server.id === serverId);

  useEffect(() => {
    let cleanup = () => {};

    getSocket().then((socket) => {
      const handler = (payload: ServerDeleteProgressPayload) => {
        if (payload.serverId !== serverId) return;
        setDeleteState({
          running: payload.status === "running",
          percent: payload.percent,
          message: payload.error ?? payload.message,
          error: payload.status === "failed" ? (payload.error ?? payload.message) : null,
        });
      };
      socket.on("server:delete-progress", handler);
      cleanup = () => socket.off("server:delete-progress", handler);
    });

    return () => cleanup();
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

  const isActive = server.status === "running" || server.status === "starting";
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
      setDeleteState({
        running: false,
        percent: 0,
        message: error instanceof Error ? error.message : "Delete failed",
        error: error instanceof Error ? error.message : "Delete failed",
      });
    }
  }

  function handleOpenFile(filePath: string, fileName: string) {
    setOpenFile({ path: filePath, name: fileName });
    setTab("files");
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Server deck"
        title={server.name}
        meta={<StatusBadge status={server.status} />}
        description={`${server.software} ${server.version} on port ${server.port}`}
        actions={
          <>
            {!isActive ? (
              <Button
                onClick={() => startServer(server.id)}
                icon={Play}
                variant="primary"
              >
                Start
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => stopServer(server.id)}
                  icon={Square}
                  variant="secondary"
                >
                  Stop
                </Button>
                <Button
                  onClick={() => restartServer(server.id)}
                  icon={RotateCcw}
                  variant="secondary"
                >
                  Restart
                </Button>
              </>
            )}
            <Button onClick={() => setConfirmDelete(true)} icon={Trash2} variant="danger">
              Delete
            </Button>
          </>
        }
      />

      <Card className="px-4 py-3">
        <p className="truncate font-mono text-xs text-muted">{server.path}</p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="RAM min" value={`${server.ramMinMb}`} detail="MB" />
        <StatTile label="RAM max" value={`${server.ramMaxMb}`} detail="MB" tone="info" />
        <StatTile label="Port" value={server.port} />
        <StatTile
          label="Auto-start"
          value={server.autoStart ? "On" : "Off"}
          tone={server.autoStart ? "good" : "neutral"}
        />
      </div>

      <Tabs
        items={TABS}
        value={tab}
        onChange={(nextTab) => {
          setTab(nextTab);
          if (nextTab !== "files") setOpenFile(null);
        }}
        label="Server sections"
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            {tab === "console" && <Console serverId={server.id} />}

            {tab === "files" && (
              <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.8fr)_minmax(460px,1.2fr)]">
                <FileManager serverId={server.id} onOpenFile={handleOpenFile} />
                {openFile ? (
                  <FileEditor
                    serverId={server.id}
                    filePath={openFile.path}
                    fileName={openFile.name}
                    onClose={() => setOpenFile(null)}
                  />
                ) : (
                  <EmptyState
                    icon={<Server className="h-8 w-8" aria-hidden="true" />}
                    title="Choose a file"
                    description="Open a configuration file from the list to edit it beside the file browser."
                  />
                )}
              </div>
            )}

            {tab === "monitor" && (
              <PerformanceMonitor serverId={server.id} ramMaxMb={server.ramMaxMb} />
            )}

            {tab === "backups" && <BackupPanel serverId={server.id} />}

            {tab === "settings" && <ServerSettings server={server} />}
          </Suspense>
        </motion.div>
      </AnimatePresence>

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

function ServerSettings({ server }: { server: ServerModel }) {
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
      startupArgs: server.startupArgs ?? "",
      autoStart: server.autoStart,
    });
  }, [server]);

  useEffect(() => {
    setRuntimeLoading(true);
    Promise.all([
      api.get<JavaRuntimeListResponse>("/api/java/runtimes"),
      api.get<JavaRecommendationResponse>(
        `/api/java/recommendation?minecraftVersion=${encodeURIComponent(server.version)}&software=${server.software}`
      ),
    ])
      .then(([runtimeResponse, recommendationResponse]) => {
        setRuntimes(
          runtimeResponse.runtimes.filter((runtime) => runtime.status === "valid")
        );
        setRecommendation(recommendationResponse);
      })
      .catch((error) =>
        setError(error instanceof Error ? error.message : "Failed to load Java runtimes")
      )
      .finally(() => setRuntimeLoading(false));
  }, [server.software, server.version]);

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
      setError(error instanceof Error ? error.message : "Save failed");
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
          <Field label="Port">
            <TextInput
              type="number"
              value={form.port}
              onChange={(event) => set("port", Number(event.target.value))}
              min={1024}
              max={65535}
            />
          </Field>
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

        {error && <Alert tone="danger">{error}</Alert>}
        {runtimeIssue && <Alert tone="warning">{runtimeIssue}</Alert>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || Boolean(runtimeIssue)}
            icon={Save}
            variant="primary"
          >
            {saving ? "Saving..." : "Save changes"}
          </Button>
          {saved && <span className="text-sm font-semibold text-grass">Saved</span>}
        </div>
      </div>
    </Card>
  );
}
