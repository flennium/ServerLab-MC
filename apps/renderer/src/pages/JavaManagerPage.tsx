import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Coffee,
  Download,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../lib/apiClient.js";
import { getSocket } from "../lib/socket.js";
import { Alert, Card, DangerZone, ManagementHeader, StatTile } from "../components/ui/Layout.js";
import { Button, IconButton } from "../components/ui/Button.js";
import { ConfirmModal } from "../components/ui/ConfirmModal.js";
import { Field, Select } from "../components/ui/Form.js";
import {
  getTerminalJobMessage,
  isSuccessfulJobStatus,
  shouldKeepJobProgress,
} from "../lib/jobLifecycle.js";
import type {
  JavaInstallProgressPayload,
  JavaInstallResponse,
  JavaRuntime,
  JavaRuntimeListResponse,
  JavaRuntimeProviderId,
  JavaRuntimeProviderListResponse,
  ServerListResponse,
} from "@serverlab/shared";

const INSTALL_TARGETS = [8, 11, 17, 21, 25];

export function JavaManagerPage() {
  const [providers, setProviders] = useState<
    JavaRuntimeProviderListResponse["providers"]
  >([]);
  const [provider, setProvider] = useState<JavaRuntimeProviderId>("adoptium");
  const [runtimes, setRuntimes] = useState<JavaRuntime[]>([]);
  const [serverUsage, setServerUsage] = useState<Record<string, number>>({});
  const [installMajor, setInstallMajor] = useState(21);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<JavaInstallProgressPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<JavaRuntime | null>(null);

  const managed = runtimes.filter((runtime) => runtime.source === "managed");
  const system = runtimes.filter((runtime) => runtime.source !== "managed");
  const validCount = runtimes.filter((runtime) => runtime.status === "valid").length;
  const managedCacheSize = managed.reduce(
    (total, runtime) => total + (runtime.sizeBytes ?? 0),
    0
  );
  const cachedInstallTarget = managed.find(
    (runtime) =>
      runtime.major === installMajor &&
      runtime.provider === provider &&
      runtime.status === "valid"
  );
  const missingCore = INSTALL_TARGETS.filter(
    (major) =>
      !runtimes.some((runtime) => runtime.major === major && runtime.status === "valid")
  );
  const invalidManaged = managed.filter((runtime) => runtime.status !== "valid");

  const providerOptions = useMemo(
    () =>
      providers.filter(
        (item) => item.enabled && item.supportedMajors.includes(installMajor)
      ),
    [installMajor, providers]
  );

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (
      providerOptions.length > 0 &&
      !providerOptions.some((item) => item.id === provider)
    ) {
      setProvider(providerOptions[0].id);
    }
  }, [provider, providerOptions]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    getSocket()
      .then((socket) => {
        const handler = (payload: JavaInstallProgressPayload) => {
          if (payload.installId !== installingId) return;
          setProgress(payload);
          if (payload.status === "completed") {
            setInstallingId(null);
            setMessage(getTerminalJobMessage(payload.status, `Java ${payload.major}`));
            setProgress(null);
            void load();
          } else if (!shouldKeepJobProgress(payload.status)) {
            setInstallingId(null);
            setMessage(getTerminalJobMessage(payload.status, `Java ${payload.major}`));
            setProgress(null);
          } else if (payload.status === "failed" || payload.status === "cancelled") {
            setInstallingId(null);
          }
        };
        socket.on("java:install-progress", handler);
        cleanup = () => socket.off("java:install-progress", handler);
      })
      .catch(() => {});
    return () => cleanup?.();
  }, [installingId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [providerData, runtimeData, serverData] = await Promise.all([
        api.get<JavaRuntimeProviderListResponse>("/api/java/providers"),
        api.get<JavaRuntimeListResponse>("/api/java/runtimes"),
        api.get<ServerListResponse>("/api/servers"),
      ]);
      setProviders(providerData.providers);
      setRuntimes(runtimeData.runtimes);
      const usage: Record<string, number> = {};
      for (const server of serverData.servers) {
        if (server.javaRuntimeId)
          usage[server.javaRuntimeId] = (usage[server.javaRuntimeId] ?? 0) + 1;
      }
      setServerUsage(usage);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load Java runtimes");
    } finally {
      setLoading(false);
    }
  }

  async function detect() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      await api.post("/api/java/detect");
      await load();
      setMessage("System Java runtimes scanned.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Java detection failed");
    } finally {
      setLoading(false);
    }
  }

  async function install() {
    const requestId = crypto.randomUUID();
    setInstallingId(requestId);
    setProgress(null);
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<JavaInstallResponse>("/api/java/installations", {
        major: installMajor,
        provider,
        requestId,
      });
      setInstallingId(null);
      if (isSuccessfulJobStatus(result.install.status)) {
        setProgress(null);
        setMessage(
          result.runtime
            ? getTerminalJobMessage(result.install.status, `Java ${result.runtime.major}`)
            : getTerminalJobMessage(result.install.status, `Java ${installMajor}`)
        );
      } else {
        const percent =
          result.install.totalBytes && result.install.totalBytes > 0
            ? (result.install.bytesReceived / result.install.totalBytes) * 100
            : result.install.stage === "done"
              ? 100
              : 0;
        setProgress({
          installId: result.install.id,
          provider: result.install.provider,
          major: result.install.major,
          version: result.install.version,
          status: result.install.status,
          stage: result.install.stage,
          bytesReceived: result.install.bytesReceived,
          totalBytes: result.install.totalBytes,
          percent,
          speedBytesPerSec: result.install.speedBytesPerSec,
          etaSeconds: result.install.etaSeconds,
          error: result.install.error ?? undefined,
        });
      }
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Java installation failed");
      setInstallingId(null);
    }
  }

  async function cancelInstall() {
    if (!installingId) return;
    await api.post(`/api/java/installations/${installingId}/cancel`);
    setInstallingId(null);
    setMessage("Java installation cancelled.");
  }

  async function validateRuntime(runtime: JavaRuntime) {
    setError(null);
    try {
      await api.post(`/api/java/runtimes/${runtime.id}/validate`);
      await load();
      setMessage(`Java ${runtime.major} validated.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Runtime validation failed");
    }
  }

  async function removeRuntime(runtime: JavaRuntime) {
    setError(null);
    try {
      await api.delete(`/api/java/runtimes/${runtime.id}`);
      await load();
      setMessage(`Java ${runtime.major} removed.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Runtime removal failed");
    }
  }

  async function revealRuntime(runtime: JavaRuntime) {
    await window.serverlab?.openPath?.(runtime.path);
  }

  return (
    <div>
      <ManagementHeader
        eyebrow="Runtime center"
        title="Java Runtime Center"
        description="Manage the Java runtimes ServerLab uses to create and start Minecraft servers."
        actions={
          <Button
            onClick={detect}
            disabled={loading}
            icon={RefreshCw}
            variant="secondary"
          >
            {loading ? "Scanning..." : "Scan system"}
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Valid runtimes" value={validCount} tone="good" />
        <StatTile label="Managed" value={managed.length} />
        <StatTile label="Java cache" value={formatBytes(managedCacheSize)} tone="info" />
        <StatTile
          label="Missing targets"
          value={missingCore.length}
          tone={missingCore.length ? "warn" : "good"}
        />
      </div>

      {error && (
        <Alert
          tone="danger"
          className="mb-4"
          autoDismissMs={8000}
          dismissKey={error}
          onDismiss={() => setError(null)}
          action={
            <IconButton
              icon={X}
              label="Dismiss Java error"
              onClick={() => setError(null)}
            />
          }
        >
          {error}
        </Alert>
      )}
      {message && (
        <Alert
          tone="success"
          className="mb-4"
          autoDismissMs={5000}
          dismissKey={message}
          onDismiss={() => setMessage(null)}
        >
          {message}
        </Alert>
      )}

      {(missingCore.length > 0 || invalidManaged.length > 0) && (
        <Card className="mb-5 border-glowstone/35 bg-glowstone/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-base font-semibold text-white">Recommended actions</p>
              <p className="mt-1 text-sm text-muted">
                {missingCore.length > 0
                  ? `Java ${missingCore[0]} is missing for newer server versions.`
                  : `${invalidManaged.length} managed runtime${invalidManaged.length === 1 ? " is" : "s are"} not valid.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {missingCore.length > 0 && (
                <Button onClick={() => { setInstallMajor(missingCore[0]); window.scrollTo({ top: 0, behavior: "smooth" }); }} icon={Download} variant="primary" size="sm">
                  Prepare Java {missingCore[0]}
                </Button>
              )}
              {invalidManaged.length > 0 && (
                <Button onClick={detect} icon={RefreshCw} variant="secondary" size="sm">
                  Rescan runtimes
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Download className="h-4 w-4 text-copper" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold">
              Install managed runtime
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Java major">
              <Select
                value={installMajor}
                onChange={(event) => setInstallMajor(Number(event.target.value))}
              >
                {INSTALL_TARGETS.map((major) => (
                  <option key={major} value={major}>
                    Java {major}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Provider">
              <Select
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value as JavaRuntimeProviderId)
                }
              >
                {providerOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {cachedInstallTarget && (
            <Alert tone="success" className="mt-4" autoDismissMs={6000}>
              Java {installMajor} from {cachedInstallTarget.distribution} is already
              cached and will be reused after validation.
            </Alert>
          )}
          <div className="mt-4 flex gap-2">
            <Button
              onClick={install}
              disabled={Boolean(installingId)}
              icon={Download}
              variant="primary"
            >
              {installingId
                ? "Installing..."
                : cachedInstallTarget
                  ? `Use cached Java ${installMajor}`
                  : `Install Java ${installMajor}`}
            </Button>
            {installingId && (
              <Button onClick={cancelInstall} icon={X} variant="danger">
                Cancel
              </Button>
            )}
          </div>
          {progress && <ProgressBlock progress={progress} />}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-copper" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold">Runtime guidance</h2>
          </div>
          <div className="grid gap-2 text-sm text-muted">
            <GuidanceRow
              label="Legacy servers"
              value="Java 8"
              installed={!missingCore.includes(8)}
            />
            <GuidanceRow
              label="Minecraft 1.17"
              value="Java 16 or newer"
              installed={runtimes.some(
                (runtime) => runtime.major >= 16 && runtime.status === "valid"
              )}
            />
            <GuidanceRow
              label="Minecraft 1.18-1.20.4"
              value="Java 17"
              installed={!missingCore.includes(17)}
            />
            <GuidanceRow
              label="Minecraft 1.20.5-1.21.8"
              value="Java 21"
              installed={!missingCore.includes(21)}
            />
            <GuidanceRow
              label="Minecraft 1.21.9+"
              value="Java 25"
              installed={!missingCore.includes(25)}
            />
          </div>
        </Card>
      </div>

      <RuntimeSection
        title="Cached managed runtimes"
        runtimes={managed}
        usage={serverUsage}
        onValidate={validateRuntime}
        onRemove={setPendingRemoval}
        onReveal={revealRuntime}
      />
      <RuntimeSection
        title="System and manual runtimes"
        runtimes={system}
        usage={serverUsage}
        onValidate={validateRuntime}
        onRemove={setPendingRemoval}
        onReveal={revealRuntime}
      />

      {pendingRemoval && (
        <ConfirmModal
          title={`Remove Java ${pendingRemoval.major}?`}
          message={`ServerLab will remove this ${pendingRemoval.source} runtime from its runtime list and cached files when allowed. Servers currently using a runtime must be reassigned first.`}
          confirmLabel="Remove runtime"
          danger
          onConfirm={() => {
            void removeRuntime(pendingRemoval);
            setPendingRemoval(null);
          }}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
    </div>
  );
}

function RuntimeSection({
  title,
  runtimes,
  usage,
  onValidate,
  onRemove,
  onReveal,
}: {
  title: string;
  runtimes: JavaRuntime[];
  usage: Record<string, number>;
  onValidate: (runtime: JavaRuntime) => void;
  onRemove: (runtime: JavaRuntime) => void;
  onReveal: (runtime: JavaRuntime) => void;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      {runtimes.length === 0 ? (
        <div className="rounded border border-border bg-rail px-4 py-8 text-center">
          <Coffee className="mx-auto mb-3 h-8 w-8 text-copper" aria-hidden="true" />
          <p className="font-display text-base font-semibold text-white">
            No runtimes here
          </p>
          <p className="mt-1 text-sm text-muted">
            Scan the system or install a managed runtime.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {runtimes.map((runtime) => {
            const usedBy = usage[runtime.id] ?? 0;
            return (
              <Card key={runtime.id} className="p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-lg font-semibold text-white">
                        Java {runtime.major}
                      </p>
                      <span className="rounded border border-border bg-rail px-2 py-1 text-xs capitalize text-muted">
                        {runtime.status}
                      </span>
                      <span className="rounded border border-border bg-rail px-2 py-1 text-xs capitalize text-muted">
                        {runtime.source}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {runtime.distribution} {runtime.version}
                    </p>
                  </div>
                  {runtime.status === "valid" && (
                    <CheckCircle2
                      className="h-5 w-5 shrink-0 text-grass"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <p className="mb-3 truncate font-mono text-xs text-muted">
                  {runtime.executablePath}
                </p>
                <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-muted">
                  <span>
                    Used by {usedBy} server{usedBy === 1 ? "" : "s"}
                  </span>
                  <span>
                    {runtime.sizeBytes !== null
                      ? formatBytes(runtime.sizeBytes)
                      : "Size unknown"}
                  </span>
                  <span>
                    {runtime.os} / {runtime.arch}
                  </span>
                  <span>Last used {formatDate(runtime.lastUsedAt)}</span>
                  <span>
                    Installed {formatDate(runtime.installedAt ?? runtime.detectedAt)}
                  </span>
                  <span>Validated {formatDate(runtime.lastValidatedAt)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => onValidate(runtime)}
                    icon={ShieldCheck}
                    variant="secondary"
                    size="sm"
                  >
                    Validate
                  </Button>
                  <Button
                    onClick={() => onReveal(runtime)}
                    icon={FolderOpen}
                    variant="secondary"
                    size="sm"
                  >
                    Reveal
                  </Button>
                </div>
                <DangerZone
                  title="Remove runtime"
                  description={
                    usedBy > 0
                      ? `Reassign ${usedBy} server${usedBy === 1 ? "" : "s"} before removing this runtime.`
                      : "Remove this runtime from ServerLab's managed cache or runtime list."
                  }
                  compact
                  className="mt-3"
                >
                  <Button
                    onClick={() => onRemove(runtime)}
                    disabled={usedBy > 0}
                    icon={Trash2}
                    variant="danger"
                    size="sm"
                  >
                    {usedBy > 0 ? "In use" : "Remove unused"}
                  </Button>
                </DangerZone>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

function GuidanceRow({
  label,
  value,
  installed,
}: {
  label: string;
  value: string;
  installed: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-border bg-surface-console px-3 py-2">
      <span>{label}</span>
      <span
        className={installed ? "font-semibold text-grass" : "font-semibold text-copper"}
      >
        {value}
      </span>
    </div>
  );
}

function ProgressBlock({ progress }: { progress: JavaInstallProgressPayload }) {
  const percent = Math.round(progress.percent);
  const failed = progress.status === "failed" || progress.status === "cancelled";
  return (
    <div className="mt-4 rounded border border-border bg-rail p-3">
      <div className="mb-2 flex justify-between text-xs text-muted">
        <span className="capitalize">{progress.stage.replace(/-/g, " ")}</span>
        <span className={failed ? "font-mono text-redstone" : "font-mono text-white"}>
          {percent}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel">
        <div
          className={
            failed ? "h-full bg-redstone transition-all" : "h-full bg-copper transition-all"
          }
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between gap-3 text-xs text-muted">
        <span>
          {formatBytes(progress.bytesReceived)}
          {progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}
        </span>
        <span>
          {formatBytes(progress.speedBytesPerSec)}/s
          {progress.etaSeconds !== null
            ? `, ${formatDuration(progress.etaSeconds)} left`
            : ""}
        </span>
      </div>
      {progress.error && <p className="mt-2 text-xs text-redstone">{progress.error}</p>}
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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function formatDate(value: Date | string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString();
}
