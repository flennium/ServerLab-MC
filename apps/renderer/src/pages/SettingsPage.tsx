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
  Download,
  FolderOpen,
  Info,
  Keyboard,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "../components/ui/Button.js";
import { Alert, Card, DangerZone, ManagementHeader } from "../components/ui/Layout.js";
import { ConfirmModal } from "../components/ui/ConfirmModal.js";
import { LabelValue, Switch } from "../components/ui/Form.js";
import { api } from "../lib/apiClient.js";
import { reportError } from "../lib/errorStore.js";
import {
  APP_VERSION,
  type AppErrorEvent,
  type ErrorHistoryResponse,
  type JavaRuntime,
  type JavaGuidanceResponse,
  type JavaRuntimeListResponse,
  type PortStatus,
  type PortStatusListResponse,
  type ServerListResponse,
  type SoftwareArtifact,
  type SoftwareArtifactListResponse,
  type TemplateCapabilityResponse,
  type AppUpdateInfo,
  type UpdateProgress,
  type UpdateSettings,
  type UpdateStatus,
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
        .catch((error) => reportError(error, {
          category: "electron",
          severity: "warning",
          userMessage: "The installed app version could not be read.",
          possibleSolution: "Restart ServerLab MC and try again.",
          source: "renderer:settings",
          action: "read-app-version",
        }));
    }
  }, []);

  async function handleOpenDataFolder() {
    setOpeningFolder(true);
    try {
      if (window.serverlab?.openPath) {
        const { path } = await api.get<{ path: string }>("/api/data-path");
        await window.serverlab.openPath(path);
      }
    } catch (error) {
      reportError(error, {
        category: "file",
        userMessage: "The app data folder could not be opened.",
        possibleSolution: "Check that the local backend is running and try again.",
        source: "renderer:settings",
        action: "open-data-folder",
      });
    } finally {
      setOpeningFolder(false);
    }
  }

  return (
    <div>
      <ManagementHeader
        eyebrow="Local app"
        title="Settings"
        description="Application metadata, local storage, and keyboard affordances."
      />

      <div className="flex max-w-5xl flex-col gap-6">
        <section>
          <SettingsSectionHeading title="General" description="Identity, local storage, and everyday keyboard controls." />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SettingsCard icon={Info} title="About">
              <div className="flex flex-col gap-3">
                <LabelValue label="Application" value="ServerLab MC" />
                <LabelValue label="Version" value={`v${version}`} />
                <LabelValue label="Platform" value={platform} />
                <LabelValue label="Engine" value="Electron + React + Node.js" />
              </div>
            </SettingsCard>
            <SettingsCard icon={Database} title="Local data">
              <p className="mb-4 text-sm leading-6 text-muted">Server profiles and backups are stored on this machine.</p>
              <Button onClick={handleOpenDataFolder} disabled={openingFolder} icon={FolderOpen} variant="secondary">
                {openingFolder ? "Opening..." : "Open data folder"}
              </Button>
            </SettingsCard>
            <SettingsCard icon={Keyboard} title="Keyboard">
              <div className="flex flex-col gap-3">
                <ShortcutRow keys={["Ctrl", "S"]} label="Save the open file" />
                <ShortcutRow keys={["Ctrl", "F"]} label="Search the console" />
                <ShortcutRow keys={["Ctrl", "Shift", "F"]} label="Search the entire server" />
                <ShortcutRow keys={["Ctrl", "Shift", "N"]} label="Create a new file" />
                <ShortcutRow keys={["Up", "Down"]} label="Browse console command history" />
                <ShortcutRow keys={["Enter"]} label="Send console command" />
              </div>
            </SettingsCard>
            <UpdatePanel />
          </div>
        </section>

        <section>
          <SettingsSectionHeading title="Storage and support" description="Software cache, runtime diagnostics, and local error history." />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <InstallerToolsPanel />
            <RuntimeGuidancePanel />
            <SoftwareCachePanel />
            <ErrorHistoryPanel />
          </div>
        </section>

        <section>
          <SettingsSectionHeading title="Roadmap" description="Planned capabilities are shown separately from operational controls." />
          <TemplateSystemPanel />
        </section>

        <DeveloperPanel />
      </div>
    </div>
  );
}

const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  autoCheck: true,
  autoDownload: false,
  autoInstall: false,
  skippedVersion: null,
  lastCheckedAt: null,
};

function UpdatePanel() {
  const [settings, setSettings] = useState<UpdateSettings>(DEFAULT_UPDATE_SETTINGS);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<AppUpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [runningServers, setRunningServers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.serverlab;
    if (!bridge?.getUpdaterSettings) return;

    void bridge.getUpdaterSettings().then(setSettings).catch((error) => reportError(error, {
      category: "update",
      severity: "warning",
      userMessage: "Update settings could not be loaded.",
      possibleSolution: "Restart ServerLab MC and try again.",
      source: "renderer:updates",
      action: "load-update-settings",
    }));
    const cleanups = [
      bridge.onUpdaterUpdateAvailable((info) => {
        setUpdate(info);
        setStatus("available");
        setRunningServers([]);
      }),
      bridge.onUpdaterNotAvailable(() => {
        setUpdate(null);
        setProgress(null);
        setRunningServers([]);
        setStatus("not-available");
      }),
      bridge.onUpdaterProgress((nextProgress) => {
        setProgress(nextProgress);
        setStatus("downloading");
      }),
      bridge.onUpdaterDownloaded((info) => {
        setUpdate(info);
        setProgress(null);
        setStatus("downloaded");
      }),
      bridge.onUpdaterError((error) => {
        setProgress(null);
        setStatus("error");
        setMessage(error.message);
      }),
      bridge.onUpdaterInstallBlocked((result) => {
        setStatus("downloaded");
        setRunningServers(result.runningServers?.map((server) => server.name) ?? []);
      }),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  async function checkForUpdates() {
    const bridge = window.serverlab;
    if (!bridge?.checkForUpdates) {
      setMessage("Update checks are available in the packaged app.");
      return;
    }
    setMessage(null);
    setStatus("checking");
    try {
      const result = await bridge.checkForUpdates();
      setStatus(result.status);
      setUpdate(result.info);
      if (result.status === "not-available") setMessage("You are running the latest stable release.");
    } catch (error) {
      reportError(error, {
        category: "update",
        userMessage: "ServerLab could not check for updates.",
        possibleSolution: "Check your connection and try again.",
        source: "renderer:updates",
        action: "check-for-updates",
      });
      setStatus("error");
      setMessage("ServerLab could not check for updates. Check your connection and try again.");
    }
  }

  async function downloadUpdate() {
    if (!window.serverlab?.downloadUpdate) return;
    setMessage(null);
    setStatus("downloading");
    try {
      await window.serverlab.downloadUpdate();
    } catch (error) {
      reportError(error, {
        category: "update",
        userMessage: "The update download failed.",
        possibleSolution: "Check your connection and try the download again.",
        source: "renderer:updates",
        action: "download-update",
      });
      setStatus("error");
      setMessage("The update download failed. Your current version is still running.");
    }
  }

  async function installUpdate(stopServers: boolean) {
    const action = stopServers
      ? window.serverlab?.stopAndInstallUpdate
      : window.serverlab?.installUpdate;
    if (!action) return;
    setMessage(null);
    try {
      const result = await action();
      if (result.status === "blocked") {
        setRunningServers(result.runningServers?.map((server) => server.name) ?? []);
        return;
      }
      setMessage("ServerLab is restarting to finish the update.");
    } catch (error) {
      reportError(error, {
        category: "update",
        userMessage: "The update could not be installed.",
        possibleSolution: "Close running servers and try the update again.",
        source: "renderer:updates",
        action: "install-update",
      });
      setStatus("error");
      setMessage("The update could not be installed. Your current version is still running.");
    }
  }

  async function updateSetting(key: keyof Pick<UpdateSettings, "autoCheck" | "autoDownload" | "autoInstall">, value: boolean) {
    if (!window.serverlab?.setUpdaterSettings) return;
    try {
      const next = await window.serverlab.setUpdaterSettings({ [key]: value });
      setSettings(next);
    } catch (error) {
      reportError(error, {
        category: "update",
        userMessage: "The update setting could not be saved.",
        possibleSolution: "Try changing the setting again.",
        source: "renderer:updates",
        action: "save-update-setting",
      });
    }
  }

  async function skipVersion() {
    if (!update || !window.serverlab?.skipUpdate) return;
    try {
      const next = await window.serverlab.skipUpdate(update.version);
      setSettings(next);
      setUpdate(null);
      setStatus("idle");
      setMessage(`Version ${update.version} will not be recommended again.`);
    } catch (error) {
      reportError(error, {
        category: "update",
        userMessage: "The update could not be skipped.",
        possibleSolution: "Try again after restarting ServerLab MC.",
        source: "renderer:updates",
        action: "skip-update",
      });
    }
  }

  return (
    <SettingsCard icon={Download} title="Updates">
      <div className="flex flex-col gap-4">
        <div className="grid gap-2 text-sm">
          <LabelValue label="Current version" value={`v${APP_VERSION}`} />
          <LabelValue label="Channel" value="Stable" />
          <LabelValue label="Last checked" value={formatDate(settings.lastCheckedAt)} />
        </div>

        <div className="grid gap-3 rounded border border-border bg-rail px-3 py-3">
          <Switch label="Automatically check for updates" checked={settings.autoCheck} onChange={(value) => void updateSetting("autoCheck", value)} />
          <Switch label="Download updates automatically" checked={settings.autoDownload} onChange={(value) => void updateSetting("autoDownload", value)} />
          <Switch label="Install updates automatically" checked={settings.autoInstall} onChange={(value) => void updateSetting("autoInstall", value)} />
        </div>

        {message && (
          <Alert tone={status === "error" ? "danger" : "info"} autoDismissMs={7000} dismissKey={message} onDismiss={() => setMessage(null)}>
            {message}
          </Alert>
        )}

        {update && settings.skippedVersion !== update.version && (
          <div className="rounded border border-copper/50 bg-copper/10 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white">Stable update available: v{update.version}</p>
                <p className="mt-1 text-xs text-muted">
                  {update.downloadSize ? `${formatBytes(update.downloadSize)} download` : "Download size unavailable"}
                </p>
              </div>
              <span className="rounded border border-copper/50 px-2 py-1 text-xs uppercase text-copper">
                {update.mandatory ? "Required" : "Stable only"}
              </span>
            </div>
            {update.releaseNotes && (
              <div className="mt-3 max-h-28 overflow-auto border-t border-border pt-3 text-xs leading-5 text-muted">
                {renderReleaseNotes(update.releaseNotes, update.releaseUrl)}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {status === "available" && <Button onClick={downloadUpdate} icon={Download} variant="primary" size="sm">Download update</Button>}
              {status === "downloaded" && <Button onClick={() => void installUpdate(false)} variant="primary" size="sm">Restart and install</Button>}
              {!update.mandatory && <Button onClick={skipVersion} variant="quiet" size="sm">Skip version</Button>}
            </div>
          </div>
        )}

        {progress && (
          <div className="rounded border border-border bg-rail px-3 py-3">
            <div className="mb-2 flex justify-between gap-3 text-xs text-muted">
              <span>Downloading stable update</span>
              <span>{progress.percent.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-surface-console">
              <div className="h-full bg-copper transition-[width]" style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {formatBytes(progress.transferred)} / {formatBytes(progress.total)} at {formatBytes(progress.bytesPerSecond)}/s
            </p>
          </div>
        )}

        {runningServers.length > 0 && (
          <div className="rounded border border-glowstone/50 bg-glowstone/10 px-3 py-3 text-sm">
            <p className="font-semibold text-white">Servers must stop before installing</p>
            <p className="mt-1 text-xs text-muted">Running: {runningServers.join(", ")}</p>
            <Button onClick={() => void installUpdate(true)} className="mt-3" variant="primary" size="sm">Stop servers and install</Button>
          </div>
        )}

        <Button onClick={() => void checkForUpdates()} disabled={status === "checking"} icon={RefreshCw} variant="secondary" size="sm">
          {status === "checking" ? "Checking..." : "Check for updates"}
        </Button>
        <p className="text-xs leading-5 text-muted">Only published stable releases are recommended. Beta and alpha releases are ignored.</p>
      </div>
    </SettingsCard>
  );
}

function renderReleaseNotes(notes: string, releaseUrl: string): ReactNode {
  return notes.split(/\r?\n/).map((line, index) => {
    const match = line.match(/^\s*Full Changelog:\s*(v?\d+\.\d+\.\d+)\.\.\.(v?\d+\.\d+\.\d+)\s*$/i);
    if (match) {
      const compareUrl = `https://github.com/flennium/ServerLab-MC/compare/${match[1]}...${match[2]}`;
      return (
        <p key={`${line}-${index}`}>
          Full Changelog: {" "}
          <a href={compareUrl} target="_blank" rel="noreferrer" className="font-semibold text-copper hover:text-copper-hover">
            {match[1]}...{match[2]}
          </a>
        </p>
      );
    }

    if (!line.trim()) return <div key={`${line}-${index}`} className="h-2" />;
    return (
      <p key={`${line}-${index}`}>
        {line} {index === 0 && <a href={releaseUrl} target="_blank" rel="noreferrer" className="ml-1 text-copper hover:text-copper-hover">Release page</a>}
      </p>
    );
  });
}

function ErrorHistoryPanel() {
  const [errors, setErrors] = useState<AppErrorEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"success" | "warning">("success");

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const data = window.serverlab?.getErrorHistory
        ? await window.serverlab.getErrorHistory()
        : await api.get<ErrorHistoryResponse>("/api/errors?limit=100&includeCleared=false");
      setErrors(data.errors.filter((error) => !error.clearedAt));
    } catch (error) {
      reportError(error, {
        category: "renderer",
        severity: "warning",
        userMessage: "Error history is unavailable while the local backend is offline.",
        possibleSolution: "Restart ServerLab MC and try again.",
        source: "renderer:error-history",
        action: "load-error-history",
      });
      setMessageTone("warning");
      setMessage("Error history is unavailable while the local backend is offline.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function clearAll() {
    try {
      if (window.serverlab?.clearErrorHistory) {
        await window.serverlab.clearErrorHistory();
      } else {
        await api.post("/api/errors/clear");
      }
      setErrors([]);
      setMessageTone("success");
      setMessage("Error history cleared.");
    } catch (error) {
      reportError(error, {
        category: "renderer",
        severity: "warning",
        userMessage: "Error history could not be cleared.",
        possibleSolution: "Reconnect the local backend and try again.",
        source: "renderer:error-history",
        action: "clear-error-history",
      });
      setMessageTone("warning");
      setMessage("Error history is unavailable while the local backend is offline.");
    }
  }

  async function copyError(error: AppErrorEvent) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(error, null, 2));
      setMessageTone("success");
      setMessage("Error details copied.");
    } catch (cause) {
      reportError(cause, {
        category: "renderer",
        severity: "warning",
        userMessage: "Error details could not be copied.",
        possibleSolution: "Select the details manually and copy them.",
        source: "renderer:error-history",
        action: "copy-error-details",
      });
    }
  }

  async function clearOne(id: string) {
    try {
      await api.post(`/api/errors/${id}/clear`);
      setErrors((current) =>
        current.filter((error) => error.id !== id)
      );
      setMessageTone("success");
      setMessage("Error cleared.");
    } catch (error) {
      reportError(error, {
        category: "renderer",
        severity: "warning",
        userMessage: "The error could not be cleared.",
        possibleSolution: "Reconnect the local backend and try again.",
        source: "renderer:error-history",
        action: "clear-error",
      });
      setMessageTone("warning");
      setMessage("Error history is unavailable while the local backend is offline.");
    }
  }

  async function exportLogs() {
    try {
      const logs = window.serverlab?.exportLogs
        ? await window.serverlab.exportLogs()
        : await api.get("/api/logs/export");
      await navigator.clipboard.writeText(JSON.stringify(logs, null, 2));
      setMessageTone("success");
      setMessage("Logs copied.");
    } catch (error) {
      reportError(error, {
        category: "renderer",
        severity: "warning",
        userMessage: "Logs could not be exported.",
        possibleSolution: "Reconnect the local backend and try again.",
        source: "renderer:error-history",
        action: "export-logs",
      });
      setMessageTone("warning");
      setMessage("Logs are unavailable while the local backend is offline.");
    }
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

      {message && (
        <Alert
          tone={messageTone}
          className="mb-3"
          autoDismissMs={5000}
          dismissKey={message}
          onDismiss={() => setMessage(null)}
        >
          {message}
        </Alert>
      )}

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
        <div className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
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
  const [ports, setPorts] = useState<PortStatus[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function loadDiagnostics() {
    setMessage(null);
    try {
      const [nextDiagnostics, portResponse] = await Promise.all([
        window.serverlab?.getDiagnostics?.(),
        api.get<PortStatusListResponse>("/api/ports/status").catch(() => ({ ports: [] })),
        api.get<{ ok: boolean }>("/health")
          .then(() => setBackendHealth("online"))
          .catch(() => setBackendHealth("offline")),
      ]);
      if (nextDiagnostics) setDiagnostics(nextDiagnostics);
      setPorts(portResponse.ports);
    } catch (error) {
      reportError(error, {
        category: "network",
        severity: "warning",
        userMessage: "Diagnostics could not be loaded.",
        possibleSolution: "Restart ServerLab MC and refresh diagnostics.",
        source: "renderer:developer-tools",
        action: "load-diagnostics",
      });
      setBackendHealth("offline");
    }
  }

  useEffect(() => {
    loadDiagnostics();
  }, []);

  async function copyDiagnostics() {
    if (!diagnostics) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ diagnostics, backendHealth, ports }, null, 2));
      setMessage("Diagnostics copied.");
    } catch (cause) {
      reportError(cause, {
        category: "renderer",
        severity: "warning",
        userMessage: "Diagnostics could not be copied.",
        possibleSolution: "Select the diagnostics manually and copy them.",
        source: "renderer:developer-tools",
        action: "copy-diagnostics",
      });
    }
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

      {message && (
        <Alert
          tone="success"
          className="mb-3"
          autoDismissMs={5000}
          dismissKey={message}
          onDismiss={() => setMessage(null)}
        >
          {message}
        </Alert>
      )}

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

        <div className="rounded border border-border bg-surface-console px-3 py-3 md:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-copper" aria-hidden="true" />
            <span className="font-semibold text-white">Ports</span>
          </div>
          <div className="grid gap-2 text-sm">
            <LabelValue label="Backend / Socket.IO" value={diagnostics?.backendOrigin ?? "Unknown"} />
            {ports.length === 0 ? (
              <p className="text-sm text-muted">No Minecraft server ports are assigned yet.</p>
            ) : (
              <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
                {ports.map((port) => (
                  <div
                    key={`${port.ownerId ?? "external"}-${port.port}`}
                    className="grid gap-1 rounded border border-border bg-panel px-3 py-2 sm:grid-cols-[auto_1fr_auto]"
                  >
                    <span className="font-mono text-sm font-semibold text-white">{port.port}</span>
                    <span className="min-w-0 truncate text-muted">{port.ownerName ?? port.message}</span>
                    <span className={port.available ? "text-grass" : "text-glowstone"}>
                      {port.available ? "free" : port.source}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
      .catch((error) => reportError(error, {
        category: "template",
        severity: "warning",
        userMessage: "Future feature status could not be loaded.",
        possibleSolution: "Refresh Settings to try again.",
        source: "renderer:roadmap",
        action: "load-roadmap",
      }));
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

function InstallerToolsPanel() {
  const [pendingAction, setPendingAction] = useState<"settings" | "cache" | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openDataFolder() {
    try {
      const { path } = await api.get<{ path: string }>("/api/data-path");
      await window.serverlab?.openPath?.(path);
    } catch (cause) {
      setError(reportError(cause, {
        category: "file",
        userMessage: "The app data folder could not be opened.",
        possibleSolution: "Check the local backend and app folder permissions.",
        source: "renderer:troubleshooting",
        action: "open-data-folder",
      }).userMessage);
    }
  }

  async function resetData() {
    if (!pendingAction || !window.serverlab?.resetData) return;
    setWorking(true);
    setError(null);
    try {
      const options = pendingAction === "settings"
        ? { settings: true, temporary: true }
        : { cache: true, temporary: true };
      await window.serverlab.resetData(options);
      setMessage(
        pendingAction === "settings"
          ? "Application settings and temporary files were reset."
          : "Software and Java caches were cleared."
      );
      setPendingAction(null);
    } catch (cause) {
      setError(reportError(cause, {
        category: "file",
        userMessage: "The reset could not be completed.",
        possibleSolution: "Close active operations and try again.",
        source: "renderer:troubleshooting",
        action: "reset-app-data",
      }).userMessage);
    } finally {
      setWorking(false);
    }
  }

  return (
    <SettingsCard icon={Wrench} title="Troubleshooting">
      <p className="mb-4 text-sm leading-6 text-muted">
        Recovery tools affect only application files. Servers, backups, templates, and worlds are never removed by these actions.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={openDataFolder} icon={FolderOpen} variant="secondary" size="sm">
          Open data folder
        </Button>
        <Button
          onClick={() => window.serverlab?.openInstallDirectory?.()}
          icon={FolderOpen}
          variant="secondary"
          size="sm"
        >
          Open install folder
        </Button>
        <Button
          onClick={() => void window.serverlab?.exportLogs?.()}
          icon={Download}
          variant="secondary"
          size="sm"
        >
          Export logs
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <Button onClick={() => setPendingAction("settings")} icon={RefreshCw} variant="quiet" size="sm">
          Reset settings
        </Button>
        <Button onClick={() => setPendingAction("cache")} icon={Trash2} variant="danger" size="sm">
          Clear caches
        </Button>
      </div>
      {message && (
        <Alert tone="success" className="mt-3" autoDismissMs={5000} dismissKey={message} onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}
      {error && (
        <Alert tone="danger" className="mt-3" autoDismissMs={7000} dismissKey={error} onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {pendingAction && (
        <ConfirmModal
          title={pendingAction === "settings" ? "Reset application settings?" : "Clear software and Java caches?"}
          message={
            pendingAction === "settings"
              ? "This resets ServerLab preferences and temporary files. Servers, backups, templates, and server metadata remain untouched."
              : "This removes cached server software and managed Java runtimes. Existing server folders remain safe, but affected runtimes or software must be downloaded again."
          }
          confirmLabel={pendingAction === "settings" ? "Reset settings" : "Clear caches"}
          danger={pendingAction === "cache"}
          loading={working}
          onConfirm={() => void resetData()}
          onCancel={() => !working && setPendingAction(null)}
        />
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

function SettingsSectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3 border-b border-border pb-2">
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}

function RuntimeGuidancePanel() {
  const [guidance, setGuidance] = useState<JavaGuidanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setGuidance(await api.get<JavaGuidanceResponse>("/api/java/guidance"));
    } catch (cause) {
      setError(reportError(cause, {
        category: "java",
        userMessage: "Runtime guidance could not be refreshed.",
        possibleSolution: "Check the backend connection and try again.",
        source: "renderer:runtime-guidance",
        action: "load-runtime-guidance",
      }).userMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Card className="p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-copper" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold">Runtime guidance</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            Requirements are checked from each server JAR first, then compared with official provider metadata.
          </p>
        </div>
        <Button onClick={load} disabled={loading} icon={RefreshCw} variant="secondary" size="sm">
          {loading ? "Checking..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <Alert tone="danger" className="mb-3" autoDismissMs={7000} dismissKey={error} onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {!guidance && loading ? (
        <div className="rounded border border-border bg-rail px-4 py-6 text-sm text-muted">Checking installed server JARs and official metadata...</div>
      ) : guidance?.entries.length ? (
        <div className="grid max-h-[30rem] gap-2 overflow-y-auto pr-1">
          {guidance.entries.map((entry) => (
            <div key={entry.serverId} className="rounded border border-border bg-rail px-3 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{entry.serverName}</span>
                    <span className="rounded border border-border bg-panel px-2 py-0.5 text-xs capitalize text-muted">
                      {entry.software} {entry.version}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">Checked {formatDate(entry.checkedAt)}</p>
                </div>
                <span className={entry.selectedRuntimeMajor && entry.selectedRuntimeMajor >= entry.requiredMajor
                  ? "rounded border border-grass/40 bg-grass/10 px-2 py-1 text-xs text-grass"
                  : "rounded border border-glowstone/40 bg-glowstone/10 px-2 py-1 text-xs text-glowstone"}>
                  {entry.selectedRuntimeMajor && entry.selectedRuntimeMajor >= entry.requiredMajor ? "Compatible" : "Needs attention"}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <LabelValue label="Required" value={`Java ${entry.requiredMajor}`} />
                <LabelValue label="Selected" value={entry.selectedRuntimeMajor ? `Java ${entry.selectedRuntimeMajor}` : "None"} />
                <LabelValue label="Evidence" value={entry.detectionMethod ?? entry.source} />
                <LabelValue label="Confidence" value={entry.detectionConfidence ?? entry.confidence} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{entry.source === "online-provider-metadata" ? "Official metadata checked online" : entry.source === "jar-class-files" ? "Local JAR class files" : "Official guidance fallback"}</span>
                {entry.sourceUrl && (
                  <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-copper hover:text-copper-hover">
                    View source
                  </a>
                )}
              </div>
              {entry.warnings.length > 0 && (
                <p className="mt-2 text-xs leading-5 text-glowstone">{entry.warnings[0]}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-border bg-rail px-4 py-6 text-center text-sm text-muted">
          No server profiles are available for runtime guidance yet.
        </div>
      )}
    </Card>
  );
}

function SoftwareCachePanel() {
  const [artifacts, setArtifacts] = useState<SoftwareArtifact[]>([]);
  const [javaRuntimes, setJavaRuntimes] = useState<JavaRuntime[]>([]);
  const [runtimeUsage, setRuntimeUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingArtifactRemoval, setPendingArtifactRemoval] =
    useState<SoftwareArtifact | null>(null);
  const [pendingRuntimeRemoval, setPendingRuntimeRemoval] =
    useState<JavaRuntime | null>(null);

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
      setError(reportError(error, {
        category: "download",
        userMessage: "The software cache could not be loaded.",
        possibleSolution: "Refresh the cache or restart ServerLab MC.",
        source: "renderer:software-cache",
        action: "load-cache",
      }).userMessage);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function revealCache() {
    if (!window.serverlab?.openPath) return;
    try {
      const { path } = await api.get<{ path: string }>("/api/software/cache/path");
      await window.serverlab.openPath(path);
    } catch (error) {
      reportError(error, {
        category: "file",
        userMessage: "The software cache folder could not be opened.",
        possibleSolution: "Check the app data folder permissions and try again.",
        source: "renderer:software-cache",
        action: "open-software-cache",
      });
    }
  }

  async function removeArtifact(id: string) {
    setError(null);
    try {
      await api.delete(`/api/software/cache/${id}`);
      await load();
    } catch (error) {
      setError(reportError(error, {
        category: "download",
        userMessage: "The cached software could not be removed.",
        possibleSolution: "Check whether a server is using it and try again.",
        source: "renderer:software-cache",
        action: "remove-software-cache",
      }).userMessage);
    }
  }

  async function removeRuntime(id: string) {
    setError(null);
    try {
      await api.delete(`/api/java/runtimes/${id}`);
      await load();
    } catch (error) {
      setError(reportError(error, {
        category: "java",
        userMessage: "The cached Java runtime could not be removed.",
        possibleSolution: "Reassign servers using it and try again.",
        source: "renderer:software-cache",
        action: "remove-java-cache",
      }).userMessage);
    }
  }

  async function revealRuntime(runtime: JavaRuntime) {
    if (!window.serverlab?.openPath) return;
    try {
      await window.serverlab.openPath(runtime.path);
    } catch (error) {
      reportError(error, {
        category: "file",
        userMessage: "The Java runtime folder could not be opened.",
        possibleSolution: "Check the runtime path and app permissions.",
        source: "renderer:software-cache",
        action: "open-java-runtime",
      });
    }
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

      {error && (
        <Alert
          tone="danger"
          className="mb-4"
          autoDismissMs={8000}
          dismissKey={error}
          onDismiss={() => setError(null)}
        >
          {error}
        </Alert>
      )}

      <div className="grid gap-5">
        <CacheSection
          icon={Database}
          title="Server software"
          emptyTitle={loading ? "Loading server software..." : "No cached server software"}
          emptyDescription="Downloaded or locally built server jars will appear here after server creation."
        >
          {artifacts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted">
                  <tr>
                    <th className="pb-2 font-semibold">Provider</th>
                    <th className="pb-2 font-semibold">Minecraft</th>
                    <th className="pb-2 font-semibold">Build</th>
                    <th className="pb-2 font-semibold">Source</th>
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
                      <td className="py-3">
                        <span className="rounded border border-border bg-panel px-2 py-1 text-xs capitalize text-muted">
                          {artifact.acquisition === "build" ? artifact.buildTool ?? "local build" : "download"}
                        </span>
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
                        <DangerZone title="Remove cache" compact>
                          <Button
                            onClick={() => setPendingArtifactRemoval(artifact)}
                            icon={Trash2}
                            variant="danger"
                            size="sm"
                          >
                            Remove
                          </Button>
                        </DangerZone>
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
                      <DangerZone
                        title="Remove runtime"
                        description={
                          usedBy > 0
                            ? "Reassign servers before removing this cached Java runtime."
                            : undefined
                        }
                        compact
                      >
                        <Button
                          onClick={() => setPendingRuntimeRemoval(runtime)}
                          disabled={usedBy > 0}
                          icon={Trash2}
                          variant="danger"
                          size="sm"
                        >
                          {usedBy > 0 ? "In use" : "Remove"}
                        </Button>
                      </DangerZone>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CacheSection>
      </div>
      {pendingArtifactRemoval && (
        <ConfirmModal
          title="Remove cached server software?"
          message={`${pendingArtifactRemoval.provider} ${pendingArtifactRemoval.minecraftVersion} build ${pendingArtifactRemoval.buildId} will be removed from the shared cache. Existing servers keep their own copied files.`}
          confirmLabel="Remove cache"
          danger
          onConfirm={() => {
            void removeArtifact(pendingArtifactRemoval.id);
            setPendingArtifactRemoval(null);
          }}
          onCancel={() => setPendingArtifactRemoval(null)}
        />
      )}

      {pendingRuntimeRemoval && (
        <ConfirmModal
          title={`Remove Java ${pendingRuntimeRemoval.major}?`}
          message={`This removes the cached runtime files for ${pendingRuntimeRemoval.distribution} ${pendingRuntimeRemoval.version}. Servers using it must be reassigned first.`}
          confirmLabel="Remove runtime"
          danger
          onConfirm={() => {
            void removeRuntime(pendingRuntimeRemoval.id);
            setPendingRuntimeRemoval(null);
          }}
          onCancel={() => setPendingRuntimeRemoval(null)}
        />
      )}
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
