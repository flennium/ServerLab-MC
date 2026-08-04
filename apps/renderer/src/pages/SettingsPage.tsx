import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertCircle,
  Bug,
  Coffee,
  Copy,
  Database,
  FolderOpen,
  Info,
  Keyboard,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "../components/ui/Button.js";
import { Alert, Card, PageHeader } from "../components/ui/Layout.js";
import { LabelValue } from "../components/ui/Form.js";
import { api } from "../lib/apiClient.js";
import {
  APP_VERSION,
  type AppErrorEvent,
  type ErrorHistoryResponse,
  type JavaRuntime,
  type JavaRuntimeListResponse,
  type ServerListResponse,
  type SoftwareArtifact,
  type SoftwareArtifactListResponse,
  type TemplateCapabilityResponse,
} from "@serverlab/shared";

function getPlatformLabel(): string {
  if (typeof window !== "undefined" && window.serverlab) {
    const platform = window.serverlab.getPlatform();
    const map: Record<string, string> = {
      win32: "Windows",
      darwin: "macOS",
      linux: "Linux",
    };
    return map[platform] ?? platform;
  }
  return navigator.platform || "Unknown";
}

export function SettingsPage() {
  const [version, setVersion] = useState(APP_VERSION);
  const [platform] = useState(getPlatformLabel);
  const [openingFolder, setOpeningFolder] = useState(false);

  useEffect(() => {
    if (window.serverlab?.getAppVersion) {
      window.serverlab
        .getAppVersion()
        .then(setVersion)
        .catch(() => {});
    }
  }, []);

  async function handleOpenDataFolder() {
    setOpeningFolder(true);
    try {
      if (window.serverlab?.openPath) {
        const { path } = await api.get<{ path: string }>("/api/data-path");
        await window.serverlab.openPath(path);
      }
    } finally {
      setOpeningFolder(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Local app"
        title="Settings"
        description="Application metadata, local storage, and keyboard affordances."
      />

      <div className="grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
        <SettingsCard icon={Info} title="About">
          <div className="flex flex-col gap-3">
            <LabelValue label="Application" value="ServerLab MC" />
            <LabelValue label="Version" value={`v${version}`} />
            <LabelValue label="Platform" value={platform} />
            <LabelValue label="Engine" value="Electron + React + Node.js" />
          </div>
        </SettingsCard>

        <SettingsCard icon={Database} title="Local data">
          <p className="mb-4 text-sm leading-6 text-muted">
            Server profiles and backups are stored on this machine.
          </p>
          <Button
            onClick={handleOpenDataFolder}
            disabled={openingFolder}
            icon={FolderOpen}
            variant="secondary"
          >
            {openingFolder ? "Opening..." : "Open data folder"}
          </Button>
        </SettingsCard>

        <SettingsCard icon={Keyboard} title="Keyboard">
          <div className="flex flex-col gap-3">
            <ShortcutRow keys={["Ctrl", "S"]} label="Save the open file" />
            <ShortcutRow keys={["Up", "Down"]} label="Browse console command history" />
            <ShortcutRow keys={["Enter"]} label="Send console command" />
          </div>
        </SettingsCard>

        <TemplateSystemPanel />

        <SoftwareCachePanel />

        <ErrorHistoryPanel />

        <DeveloperPanel />
      </div>
    </div>
  );
}

function ErrorHistoryPanel() {
  const [errors, setErrors] = useState<AppErrorEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const data = window.serverlab?.getErrorHistory
        ? await window.serverlab.getErrorHistory()
        : await api.get<ErrorHistoryResponse>("/api/errors?limit=100&includeCleared=true");
      setErrors(data.errors);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function clearAll() {
    if (window.serverlab?.clearErrorHistory) {
      await window.serverlab.clearErrorHistory();
    } else {
      await api.post("/api/errors/clear");
    }
    setErrors([]);
    setMessage("Error history cleared.");
  }

  async function copyError(error: AppErrorEvent) {
    await navigator.clipboard.writeText(JSON.stringify(error, null, 2));
    setMessage("Error details copied.");
  }

  async function clearOne(id: string) {
    await api.post(`/api/errors/${id}/clear`);
    setErrors((current) =>
      current.map((error) =>
        error.id === id ? { ...error, clearedAt: new Date().toISOString() } : error
      )
    );
    setMessage("Error cleared.");
  }

  async function exportLogs() {
    const logs = window.serverlab?.exportLogs
      ? await window.serverlab.exportLogs()
      : await api.get("/api/logs/export");
    await navigator.clipboard.writeText(JSON.stringify(logs, null, 2));
    setMessage("Logs copied.");
  }

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-copper" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold">Error history</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={load} disabled={loading} icon={RefreshCw} variant="secondary" size="sm">
            Refresh
          </Button>
          <Button onClick={exportLogs} icon={Copy} variant="secondary" size="sm">
            Export logs
          </Button>
          <Button onClick={clearAll} disabled={errors.length === 0} icon={Trash2} variant="danger" size="sm">
            Clear
          </Button>
        </div>
      </div>

      {message && <Alert tone="success" className="mb-3">{message}</Alert>}

      {errors.length === 0 ? (
        <div className="rounded border border-border bg-rail px-4 py-8 text-center">
          <p className="font-display text-base font-semibold text-white">
            {loading ? "Loading errors..." : "No recent errors"}
          </p>
          <p className="mt-1 text-sm text-muted">
            Warnings and failures will appear here with recovery details.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {errors.map((error) => (
            <details
              key={error.id}
              className="rounded border border-border bg-rail px-3 py-2"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white">{error.userMessage}</p>
                    <p className="mt-1 text-xs text-muted">
                      {error.category} / {error.action} / {formatDate(error.timestamp)}
                    </p>
                  </div>
                  <span className="rounded border border-border bg-panel px-2 py-0.5 text-xs uppercase text-copper">
                    {error.severity}
                  </span>
                </div>
              </summary>
              <div className="mt-3 grid gap-2 border-t border-border pt-3 text-sm">
                {error.possibleSolution && (
                  <LabelValue label="Solution" value={error.possibleSolution} />
                )}
                <LabelValue label="Source" value={error.source} />
                <LabelValue label="Recoveries" value={error.recoveries.join(", ")} />
                {error.technicalDetails && (
                  <pre className="max-h-40 overflow-auto rounded border border-border bg-surface-console p-3 text-xs text-muted">
                    {error.technicalDetails}
                  </pre>
                )}
                <div>
                  <Button
                    onClick={() => copyError(error)}
                    icon={Copy}
                    variant="secondary"
                    size="sm"
                  >
                    Copy details
                  </Button>
                  {!error.clearedAt && (
                    <Button
                      onClick={() => clearOne(error.id)}
                      icon={Trash2}
                      variant="quiet"
                      size="sm"
                      className="ml-2"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}

function DeveloperPanel() {
  const [diagnostics, setDiagnostics] = useState<Awaited<
    ReturnType<NonNullable<typeof window.serverlab>["getDiagnostics"]>
  > | null>(null);
  const [backendHealth, setBackendHealth] = useState<"unknown" | "online" | "offline">(
    "unknown"
  );
  const [message, setMessage] = useState<string | null>(null);

  async function loadDiagnostics() {
    setMessage(null);
    try {
      const [nextDiagnostics] = await Promise.all([
        window.serverlab?.getDiagnostics?.(),
        api.get<{ ok: boolean }>("/health")
          .then(() => setBackendHealth("online"))
          .catch(() => setBackendHealth("offline")),
      ]);
      if (nextDiagnostics) setDiagnostics(nextDiagnostics);
    } catch {
      setBackendHealth("offline");
    }
  }

  useEffect(() => {
    loadDiagnostics();
  }, []);

  async function copyDiagnostics() {
    if (!diagnostics) return;
    await navigator.clipboard.writeText(JSON.stringify({ diagnostics, backendHealth }, null, 2));
    setMessage("Diagnostics copied.");
  }

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-copper" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold">Developer tools</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={loadDiagnostics} icon={RefreshCw} variant="secondary" size="sm">
            Refresh
          </Button>
          <Button onClick={() => window.serverlab?.openDevTools?.()} icon={Bug} variant="secondary" size="sm">
            Open DevTools
          </Button>
          <Button onClick={() => window.serverlab?.closeDevTools?.()} icon={Bug} variant="quiet" size="sm">
            Close DevTools
          </Button>
        </div>
      </div>

      {message && <Alert tone="success" className="mb-3">{message}</Alert>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded border border-border bg-surface-console px-3 py-3">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-copper" aria-hidden="true" />
            <span className="font-semibold text-white">Runtime diagnostics</span>
          </div>
          <div className="grid gap-2 text-sm">
            <LabelValue label="Backend" value={backendHealth} />
            <LabelValue label="Mode" value={diagnostics?.packaged ? "Packaged" : "Development"} />
            <LabelValue label="Version" value={diagnostics ? `v${diagnostics.version}` : "Unknown"} />
            <LabelValue label="Platform" value={diagnostics?.platform ?? "Unknown"} />
          </div>
        </div>

        <div className="rounded border border-border bg-surface-console px-3 py-3">
          <div className="mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-copper" aria-hidden="true" />
            <span className="font-semibold text-white">Local connection</span>
          </div>
          <div className="grid gap-2 text-sm">
            <LabelValue label="Backend origin" value={diagnostics?.backendOrigin ?? "Unknown"} />
            <LabelValue label="Data folder" value={diagnostics?.dataDir ?? "Unknown"} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={copyDiagnostics} disabled={!diagnostics} icon={Copy} variant="secondary" size="sm">
              Copy diagnostics
            </Button>
            <Button
              onClick={() => diagnostics && window.serverlab?.openPath?.(diagnostics.dataDir)}
              disabled={!diagnostics}
              icon={FolderOpen}
              variant="secondary"
              size="sm"
            >
              Open data
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function TemplateSystemPanel() {
  const [capabilities, setCapabilities] = useState<TemplateCapabilityResponse | null>(
    null
  );

  useEffect(() => {
    api
      .get<TemplateCapabilityResponse>("/api/templates/capabilities")
      .then(setCapabilities)
      .catch(() => {});
  }, []);

  return (
    <SettingsCard icon={Search} title="Future features">
      {!capabilities ? (
        <p className="text-sm text-muted">Loading future features...</p>
      ) : (
        <div className="grid gap-2">
          {capabilities.capabilities.map((capability) => (
            <div
              key={capability.id}
              className="rounded border border-border bg-rail px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-white">{capability.label}</span>
                <span className="rounded border border-border bg-panel px-2 py-0.5 text-[0.68rem] uppercase text-copper">
                  {capability.status.replace("-", " ")}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">
                {capability.description}
              </p>
              {capability.details && capability.details.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {capability.details.map((detail) => (
                    <span
                      key={detail}
                      className="rounded border border-border bg-panel px-2 py-0.5 text-[0.68rem] text-muted"
                    >
                      {detail}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-copper" aria-hidden="true" />
        <h2 className="font-display text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function SoftwareCachePanel() {
  const [artifacts, setArtifacts] = useState<SoftwareArtifact[]>([]);
  const [javaRuntimes, setJavaRuntimes] = useState<JavaRuntime[]>([]);
  const [runtimeUsage, setRuntimeUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [softwareData, javaData, serverData] = await Promise.all([
        api.get<SoftwareArtifactListResponse>("/api/software/cache"),
        api.get<JavaRuntimeListResponse>("/api/java/runtimes"),
        api.get<ServerListResponse>("/api/servers"),
      ]);
      setArtifacts(softwareData.artifacts);
      setJavaRuntimes(javaData.runtimes.filter((runtime) => runtime.source === "managed"));
      const usage: Record<string, number> = {};
      for (const server of serverData.servers) {
        if (server.javaRuntimeId) {
          usage[server.javaRuntimeId] = (usage[server.javaRuntimeId] ?? 0) + 1;
        }
      }
      setRuntimeUsage(usage);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load cache");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function revealCache() {
    if (!window.serverlab?.openPath) return;
    const { path } = await api.get<{ path: string }>("/api/software/cache/path");
    await window.serverlab.openPath(path);
  }

  async function removeArtifact(id: string) {
    setError(null);
    try {
      await api.delete(`/api/software/cache/${id}`);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to remove artifact");
    }
  }

  async function removeRuntime(id: string) {
    setError(null);
    try {
      await api.delete(`/api/java/runtimes/${id}`);
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to remove Java runtime");
    }
  }

  async function revealRuntime(runtime: JavaRuntime) {
    if (!window.serverlab?.openPath) return;
    await window.serverlab.openPath(runtime.path);
  }

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-copper" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold">Software cache</h2>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={load}
            disabled={loading}
            icon={RefreshCw}
            variant="secondary"
            size="sm"
          >
            Refresh
          </Button>
          <Button onClick={revealCache} icon={FolderOpen} variant="secondary" size="sm">
            Reveal
          </Button>
        </div>
      </div>

      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}

      <div className="grid gap-5">
        <CacheSection
          icon={Database}
          title="Server software"
          emptyTitle={loading ? "Loading server software..." : "No cached server software"}
          emptyDescription="Downloaded server jars will appear here after server creation."
        >
          {artifacts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="pb-2 font-semibold">Provider</th>
                    <th className="pb-2 font-semibold">Minecraft</th>
                    <th className="pb-2 font-semibold">Build</th>
                    <th className="pb-2 font-semibold">Size</th>
                    <th className="pb-2 font-semibold">Last used</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {artifacts.map((artifact) => (
                    <tr key={artifact.id}>
                      <td className="py-3 font-semibold capitalize text-white">
                        {artifact.provider}
                      </td>
                      <td className="py-3 font-mono text-xs text-white">
                        {artifact.minecraftVersion}
                      </td>
                      <td className="py-3 font-mono text-xs text-muted">
                        {artifact.buildId}
                      </td>
                      <td className="py-3 text-muted">
                        {formatBytes(artifact.sizeBytes)}
                      </td>
                      <td className="py-3 text-muted">
                        {formatDate(
                          artifact.lastUsedAt ?? artifact.downloadedAt ?? artifact.createdAt
                        )}
                      </td>
                      <td className="py-3">
                        <span className="rounded border border-border bg-rail px-2 py-1 text-xs capitalize text-muted">
                          {artifact.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          onClick={() => removeArtifact(artifact.id)}
                          icon={Trash2}
                          variant="danger"
                          size="sm"
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CacheSection>

        <CacheSection
          icon={Coffee}
          title="Java runtime files"
          emptyTitle={loading ? "Loading Java cache..." : "No cached Java runtimes"}
          emptyDescription="Managed Java runtimes installed by ServerLab will appear here."
        >
          {javaRuntimes.length > 0 && (
            <div className="grid gap-2">
              {javaRuntimes.map((runtime) => {
                const usedBy = runtimeUsage[runtime.id] ?? 0;
                return (
                  <div
                    key={runtime.id}
                    className="grid gap-3 rounded border border-border bg-rail px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">
                          Java {runtime.major}
                        </span>
                        <span className="rounded border border-border bg-panel px-2 py-0.5 text-xs capitalize text-muted">
                          {runtime.status}
                        </span>
                        <span className="rounded border border-border bg-panel px-2 py-0.5 text-xs text-muted">
                          {formatBytes(runtime.sizeBytes ?? 0)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted">
                        {runtime.distribution} {runtime.version} / {runtime.arch}
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-muted">
                        {runtime.path}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        Last used {formatDate(runtime.lastUsedAt)} / used by {usedBy} server
                        {usedBy === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      <Button
                        onClick={() => revealRuntime(runtime)}
                        icon={FolderOpen}
                        variant="secondary"
                        size="sm"
                      >
                        Reveal
                      </Button>
                      <Button
                        onClick={() => removeRuntime(runtime.id)}
                        disabled={usedBy > 0}
                        icon={Trash2}
                        variant="danger"
                        size="sm"
                      >
                        {usedBy > 0 ? "In use" : "Remove"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CacheSection>
      </div>
    </Card>
  );
}

function CacheSection({
  icon: Icon,
  title,
  emptyTitle,
  emptyDescription,
  children,
}: {
  icon: LucideIcon;
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
}) {
  const hasContent = Boolean(children);
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-copper" aria-hidden="true" />
        <h3 className="font-display text-base font-semibold text-white">{title}</h3>
      </div>
      {hasContent ? (
        children
      ) : (
        <div className="rounded border border-border bg-rail px-4 py-8 text-center">
          <p className="font-display text-base font-semibold text-white">
            {emptyTitle}
          </p>
          <p className="mt-1 text-sm text-muted">{emptyDescription}</p>
        </div>
      )}
    </section>
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

function formatDate(value: Date | string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex shrink-0 gap-1">
        {keys.map((key) => (
          <kbd
            key={key}
            className="rounded border border-border bg-rail px-2 py-1 font-mono text-xs text-white"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}
