import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Ban, CheckCircle2, Coffee, Download, FolderOpen, Plus, RefreshCw, X } from "lucide-react";
import { Modal } from "../ui/Modal.js";
import { useServerStore } from "../../store/serverStore.js";
import { Alert } from "../ui/Layout.js";
import { Button } from "../ui/Button.js";
import { Field, Select, Switch, TextInput } from "../ui/Form.js";
import { PortField } from "./PortField.js";
import { api } from "../../lib/apiClient.js";
import { getSocket } from "../../lib/socket.js";
import { reportError } from "../../lib/errorStore.js";
import {
  isSuccessfulJobStatus,
  shouldKeepJobProgress,
} from "../../lib/jobLifecycle.js";
import type {
  CreateServerDto,
  JavaInstallProgressPayload,
  JavaRecommendationResponse,
  JavaRuntime,
  JavaRuntimeListResponse,
  PortStatus,
  PortSuggestionResponse,
  ServerFramework,
  SoftwareBuild,
  SoftwareBuildListResponse,
  SoftwareDownloadProgressPayload,
  SoftwareProviderInfo,
  SoftwareProviderListResponse,
  SoftwareVersionListResponse,
} from "@serverlab/shared";

interface CreateServerModalProps {
  onClose: () => void;
}

const stageLabels: Record<string, string> = {
  "resolving-provider": "Resolving provider",
  "checking-cache": "Checking cache",
  downloading: "Downloading",
  verifying: "Verifying",
  extracting: "Extracting",
  validating: "Validating",
  registering: "Registering",
  "installing-server-files": "Installing files",
  "writing-eula": "Writing EULA",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

function trimTrailingSeparators(value: string): string {
  return value.replace(/[\\/]+$/, "");
}

function pathSeparator(root: string): string {
  return root.includes("\\") ? "\\" : "/";
}

function joinPath(root: string, child: string): string {
  return `${trimTrailingSeparators(root)}${pathSeparator(root)}${child}`;
}

function serverFolderName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .split("")
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "new-server";
}

function managedServerPath(serverRoot: string, name: string): string {
  return joinPath(serverRoot, serverFolderName(name));
}

export function CreateServerModal({ onClose }: CreateServerModalProps) {
  const { createServer } = useServerStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portStatus, setPortStatus] = useState<PortStatus | null>(null);
  const [providers, setProviders] = useState<SoftwareProviderInfo[]>([]);
  const [versions, setVersions] = useState<string[]>([]);
  const [builds, setBuilds] = useState<SoftwareBuild[]>([]);
  const [runtimes, setRuntimes] = useState<JavaRuntime[]>([]);
  const [recommendation, setRecommendation] = useState<JavaRecommendationResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [provider, setProvider] = useState<ServerFramework>("paper");
  const [minecraftVersion, setMinecraftVersion] = useState("");
  const [buildId, setBuildId] = useState("");
  const [javaRuntimeId, setJavaRuntimeId] = useState("");
  const [manualJava, setManualJava] = useState(false);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [softwareProgress, setSoftwareProgress] = useState<SoftwareDownloadProgressPayload | null>(null);
  const [javaProgress, setJavaProgress] = useState<JavaInstallProgressPayload | null>(null);
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null);
  const [activeJavaInstallId, setActiveJavaInstallId] = useState<string | null>(null);
  const [serverRoot, setServerRoot] = useState("");
  const [customLocation, setCustomLocation] = useState(false);
  const [step, setStep] = useState(1);

  const [form, setForm] = useState<CreateServerDto>({
    name: "",
    path: "",
    version: "",
    software: "paper",
    javaPath: "java",
    ramMinMb: 1024,
    ramMaxMb: 4096,
    port: 25565,
    autoStart: false,
  });

  const selectedProvider = providers.find((item) => item.id === provider);
  const selectedBuild = builds.find((item) => item.id === buildId);
  const selectedRuntime = runtimes.find((runtime) => runtime.id === javaRuntimeId);
  const compatibleRuntimes = recommendation
    ? runtimes.filter((runtime) => runtime.status === "valid" && runtime.major >= recommendation.requiredMajor)
    : runtimes.filter((runtime) => runtime.status === "valid");
  const canCreate = useMemo(
    () =>
      Boolean(
        form.name.trim() &&
          form.path.trim() &&
          selectedProvider?.enabled &&
          minecraftVersion &&
          buildId &&
          eulaAccepted &&
          (manualJava ? form.javaPath.trim() : javaRuntimeId) &&
          portStatus?.available &&
          !loading &&
          !activeJavaInstallId
      ),
    [
      activeJavaInstallId,
      buildId,
      eulaAccepted,
      form.javaPath,
      form.name,
      form.path,
      javaRuntimeId,
      loading,
      manualJava,
      minecraftVersion,
      portStatus,
      selectedProvider,
    ]
  );

  useEffect(() => {
    void loadRuntimes().catch((error) => setError(reportError(error, {
      category: "java",
      userMessage: "Java runtimes could not be loaded.",
      possibleSolution: "Open Java Runtime Center and retry the scan.",
      source: "renderer:create-server",
      action: "load-java-runtimes",
    }).userMessage));
    api
      .get<{ path: string }>("/api/data-path")
      .then(({ path }) => {
        const root = joinPath(path, "servers");
        setServerRoot(root);
        setForm((current) => ({
          ...current,
          path: managedServerPath(root, current.name),
        }));
      })
      .catch((error) => reportError(error, {
        category: "file",
        severity: "warning",
        userMessage: "The default server folder could not be detected.",
        possibleSolution: "Choose a server folder manually before continuing.",
        source: "renderer:create-server",
        action: "resolve-server-folder",
      }));
    api
      .get<SoftwareProviderListResponse>("/api/software/providers")
      .then(({ providers }) => {
        setProviders(providers);
        const firstEnabled = providers.find((item) => item.enabled);
        if (firstEnabled) setProvider(firstEnabled.id);
      })
      .catch((error) => setError(reportError(error, {
        category: "download",
        userMessage: "Server software providers could not be loaded.",
        possibleSolution: "Check the connection and try again.",
        source: "renderer:create-server",
        action: "load-software-providers",
      }).userMessage));
    api
      .get<PortSuggestionResponse>("/api/ports/suggest?start=25565")
      .then(({ port }) => set("port", port))
      .catch((error) => reportError(error, {
        category: "network",
        severity: "warning",
        userMessage: "An available server port could not be suggested.",
        possibleSolution: "Enter a port manually and check its availability.",
        source: "renderer:create-server",
        action: "suggest-server-port",
      }));
  }, []);

  useEffect(() => {
    if (!serverRoot || customLocation) return;
    setForm((current) => ({
      ...current,
      path: managedServerPath(serverRoot, current.name),
    }));
  }, [customLocation, form.name, serverRoot]);

  useEffect(() => {
    setForm((current) => ({ ...current, software: provider }));
    setVersions([]);
    setBuilds([]);
    setMinecraftVersion("");
    setBuildId("");
    setOffline(false);
    const currentProvider = providers.find((item) => item.id === provider);
    if (!currentProvider?.enabled) return;
    api
      .get<SoftwareVersionListResponse>(`/api/software/${provider}/versions`)
      .then(({ versions, offline }) => {
        setVersions(versions);
        setOffline(offline);
        const first = versions[0] ?? "";
        setMinecraftVersion(first);
        setForm((current) => ({ ...current, version: first }));
      })
      .catch((error) => setError(reportError(error, {
        category: "download",
        userMessage: "Minecraft versions could not be loaded.",
        possibleSolution: "Check the provider connection and try again.",
        source: "renderer:create-server",
        action: "load-software-versions",
      }).userMessage));
  }, [provider, providers]);

  useEffect(() => {
    setBuilds([]);
    setBuildId("");
    setForm((current) => ({ ...current, version: minecraftVersion }));
    if (!minecraftVersion || !selectedProvider?.enabled) return;
    api
      .get<SoftwareBuildListResponse>(
        `/api/software/${provider}/versions/${encodeURIComponent(minecraftVersion)}/builds`
      )
      .then(({ builds, offline }) => {
        setBuilds(builds);
        setOffline(offline);
        setBuildId(builds.find((build) => build.recommended)?.id ?? builds[0]?.id ?? "");
      })
      .catch((error) => setError(reportError(error, {
        category: "download",
        userMessage: "Server software builds could not be loaded.",
        possibleSolution: "Choose another version or retry the request.",
        source: "renderer:create-server",
        action: "load-software-builds",
      }).userMessage));
  }, [minecraftVersion, provider, selectedProvider?.enabled]);

  useEffect(() => {
    if (!minecraftVersion || !provider) return;
    api
      .get<JavaRecommendationResponse>(
        `/api/java/recommendation?minecraftVersion=${encodeURIComponent(minecraftVersion)}&software=${provider}`
      )
      .then((next) => {
        setRecommendation(next);
        if (!manualJava) {
          setJavaRuntimeId(next.compatibleRuntime?.id ?? "");
          if (next.compatibleRuntime) set("javaPath", next.compatibleRuntime.executablePath);
        }
      })
      .catch((error) => {
        setRecommendation(null);
        reportError(error, {
          category: "java",
          severity: "warning",
          userMessage: "Java compatibility could not be checked.",
          possibleSolution: "Select a runtime manually or retry the compatibility check.",
          source: "renderer:create-server",
          action: "load-java-recommendation",
        });
      });
  }, [minecraftVersion, provider, runtimes.length, manualJava]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    getSocket()
      .then((socket) => {
        if (disposed) return;
        const softwareHandler = (payload: SoftwareDownloadProgressPayload) => {
          if (payload.downloadId !== activeDownloadId) return;
          setSoftwareProgress(payload);
          if (payload.status === "failed" && payload.error) {
            reportError(payload.error, {
              category: "download",
              userMessage: "Server software download failed.",
              possibleSolution: "Retry the download or use a cached version.",
              source: "renderer:create-server",
              action: "download-server-software",
            });
          }
          if (!shouldKeepJobProgress(payload.status)) {
            setActiveDownloadId(null);
            setSoftwareProgress(null);
          } else if (payload.status === "failed" || payload.status === "cancelled") {
            setActiveDownloadId(null);
          }
        };
        const javaHandler = (payload: JavaInstallProgressPayload) => {
          if (payload.installId !== activeJavaInstallId) return;
          setJavaProgress(payload);
          if (payload.status === "failed" && payload.error) {
            reportError(payload.error, {
              category: "java",
              userMessage: "Java installation failed.",
              possibleSolution: "Retry the installation or select another runtime.",
              source: "renderer:create-server",
              action: "install-java",
            });
          }
          if (isSuccessfulJobStatus(payload.status)) {
            setActiveJavaInstallId(null);
            setJavaProgress(null);
            void loadRuntimes();
          } else if (payload.status === "failed" || payload.status === "cancelled") {
            setActiveJavaInstallId(null);
          }
        };
        socket.on("software:download-progress", softwareHandler);
        socket.on("java:install-progress", javaHandler);
        cleanup = () => {
          socket.off("software:download-progress", softwareHandler);
          socket.off("java:install-progress", javaHandler);
        };
      })
      .catch((error) => reportError(error, {
        category: "network",
        severity: "warning",
        userMessage: "Download progress updates are unavailable.",
        possibleSolution: "The installation can continue; retry if progress stops.",
        source: "renderer:create-server",
        action: "subscribe-install-progress",
      }));
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [activeDownloadId, activeJavaInstallId]);

  async function loadRuntimes() {
    const { runtimes } = await api.get<JavaRuntimeListResponse>("/api/java/runtimes");
    setRuntimes(runtimes);
  }

  function set<K extends keyof CreateServerDto>(key: K, value: CreateServerDto[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleBrowse() {
    if (window.serverlab) {
      const chosen = await window.serverlab.openDirectoryDialog();
      if (chosen) set("path", chosen);
    }
  }

  function setCustomServerLocation(enabled: boolean) {
    setCustomLocation(enabled);
    if (!enabled && serverRoot) {
      set("path", managedServerPath(serverRoot, form.name));
    }
  }

  async function handleScanJava() {
    await api.post("/api/java/detect");
    await loadRuntimes();
  }

  async function handleInstallJava() {
    if (!recommendation) return;
    const requestId = crypto.randomUUID();
    setActiveJavaInstallId(requestId);
    setJavaProgress(null);
    try {
      const result = await api.post<{ runtime: JavaRuntime }>("/api/java/installations", {
        major: recommendation.requiredMajor,
        requestId,
      });
      setActiveJavaInstallId(null);
      setJavaProgress(null);
      await loadRuntimes();
      if (result.runtime) {
        setJavaRuntimeId(result.runtime.id);
        set("javaPath", result.runtime.executablePath);
      }
    } catch (error) {
      setError(reportError(error, {
        category: "java",
        userMessage: "Java installation failed.",
        possibleSolution: "Retry the installation or select another runtime.",
        source: "renderer:create-server",
        action: "install-java",
      }).userMessage);
      setActiveJavaInstallId(null);
    }
  }

  async function handleCancelSoftwareDownload() {
    if (!activeDownloadId) return;
    await api.post(`/api/software/downloads/${activeDownloadId}/cancel`);
  }

  async function handleCancelJavaInstall() {
    if (!activeJavaInstallId) return;
    await api.post(`/api/java/installations/${activeJavaInstallId}/cancel`);
    setActiveJavaInstallId(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSoftwareProgress(null);
    if (!form.name.trim()) return setError("Name is required.");
    if (!form.path.trim()) return setError("Server folder is required.");
    if (!selectedProvider?.enabled) return setError(selectedProvider?.reasonUnavailable ?? "Provider unavailable.");
    if (!minecraftVersion || !buildId) return setError("Choose a Minecraft version and build.");
    if (!eulaAccepted) return setError("Accept the Minecraft EULA before creating the server.");
    if (!manualJava && !javaRuntimeId) return setError("Install or select a compatible Java runtime.");

    const requestId = crypto.randomUUID();
    setActiveDownloadId(requestId);

    try {
      setLoading(true);
      setStep(5);
      await createServer({
        ...form,
        version: minecraftVersion,
        software: provider,
        javaPath: manualJava ? form.javaPath : selectedRuntime?.executablePath ?? form.javaPath,
        javaRuntimeId: manualJava ? null : javaRuntimeId,
        javaOverrideMode: manualJava ? "manual" : "automatic",
        eulaAccepted,
        softwareSource: {
          provider,
          minecraftVersion,
          buildId,
          artifactId: selectedBuild?.artifactId,
          requestId,
        },
      });
      setActiveDownloadId(null);
      setSoftwareProgress(null);
      onClose();
    } catch (error) {
      setError(reportError(error, {
        category: "server",
        userMessage: "The server could not be created.",
        possibleSolution: "Review the server folder, port, Java runtime, and EULA selection.",
        source: "renderer:create-server",
        action: "create-server",
      }).userMessage);
      setStep(4);
    } finally {
      setLoading(false);
    }
  }

  function nextStep() {
    setError(null);
    if (step === 1 && (!form.name.trim() || !form.path.trim())) {
      setError("Add a server name and folder before continuing.");
      return;
    }
    if (step === 2 && (!selectedProvider?.enabled || !minecraftVersion || !buildId)) {
      setError("Choose an available framework, Minecraft version, and build.");
      return;
    }
    if (step === 3 && !manualJava && !javaRuntimeId) {
      setError("Install or select a compatible Java runtime before continuing.");
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  }

  return (
    <Modal title="New server" onClose={loading ? () => {} : onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-2 border-b border-border pb-4">
          {["Basics", "Software", "Java", "Review", "Install"].map((label, index) => {
            const number = index + 1;
            return (
              <button
                key={label}
                type="button"
                onClick={() => number < step && setStep(number)}
                className={`border-b-2 pb-2 text-left text-xs font-semibold transition-colors ${number === step ? "border-copper text-white" : number < step ? "border-grass/60 text-grass" : "border-border text-muted"}`}
              >
                <span className="mr-1 font-mono">0{number}</span>{label}
              </button>
            );
          })}
        </div>

        {step === 1 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Name" required>
              <TextInput value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Survival development" required />
            </Field>
            <Field label="Server folder" required>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <TextInput value={form.path} onChange={(event) => set("path", event.target.value)} placeholder={serverRoot ? managedServerPath(serverRoot, form.name) : "Loading app server folder..."} className="flex-1" readOnly={!customLocation} required />
                  <Button type="button" onClick={handleBrowse} icon={FolderOpen} variant="secondary" disabled={!customLocation}>Browse</Button>
                </div>
                <div className="rounded border border-border bg-surface-console px-3 py-2">
                  <Switch label="Use custom server location" checked={customLocation} onChange={setCustomServerLocation} />
                  {!customLocation && <p className="mt-2 text-xs text-muted">Servers are stored under the app data servers folder by default.</p>}
                </div>
              </div>
            </Field>
          </div>
        )}

        {step === 2 && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Framework"><Select value={provider} onChange={(event) => setProvider(event.target.value as ServerFramework)}>{providers.map((item) => <option key={item.id} value={item.id}>{item.label}{!item.enabled ? " unavailable" : ""}</option>)}</Select></Field>
              <Field label="Minecraft version"><Select value={minecraftVersion} disabled={!selectedProvider?.enabled || versions.length === 0} onChange={(event) => setMinecraftVersion(event.target.value)}>{versions.map((version) => <option key={version} value={version}>{version}</option>)}</Select></Field>
              <Field label="Build"><Select value={buildId} disabled={!selectedProvider?.enabled || builds.length === 0} onChange={(event) => setBuildId(event.target.value)}>{builds.map((build) => <option key={build.id} value={build.id}>{build.label}{build.cached ? " cached" : ""}</option>)}</Select></Field>
            </div>
            {selectedProvider && !selectedProvider.enabled && <Alert tone="warning">{selectedProvider.reasonUnavailable}</Alert>}
            {offline && <Alert tone="warning">Offline: cached software only.</Alert>}
            <SoftwareStatus cached={selectedBuild?.cached === true} selectedBuild={selectedBuild} progress={softwareProgress} onCancel={handleCancelSoftwareDownload} cancellable={loading && softwareProgress?.stage === "downloading"} />
          </>
        )}

        {step === 3 && (
          <JavaRuntimePanel
            manualJava={manualJava}
            setManualJava={setManualJava}
            javaPath={form.javaPath}
            setJavaPath={(value) => set("javaPath", value)}
            recommendation={recommendation}
            runtimes={compatibleRuntimes}
            selectedRuntimeId={javaRuntimeId}
            setSelectedRuntimeId={(id) => { setJavaRuntimeId(id); const runtime = runtimes.find((item) => item.id === id); if (runtime) set("javaPath", runtime.executablePath); }}
            progress={javaProgress}
            installing={Boolean(activeJavaInstallId)}
            onInstall={handleInstallJava}
            onCancelInstall={handleCancelJavaInstall}
            onScan={handleScanJava}
          />
        )}

        {step === 4 && (
          <>
            <div className="rounded border border-border bg-surface-console px-4 py-3">
              <p className="font-display text-base font-semibold text-white">Review server profile</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <ReviewItem label="Name" value={form.name || "Not set"} />
                <ReviewItem label="Software" value={`${provider} ${minecraftVersion || "Not set"}`} />
                <ReviewItem label="Java" value={manualJava ? "Manual path" : recommendation ? `Java ${recommendation.requiredMajor}` : "Not selected"} />
                <ReviewItem label="Port" value={String(form.port)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="RAM min (MB)"><TextInput type="number" value={form.ramMinMb} onChange={(event) => set("ramMinMb", Number(event.target.value))} min={512} /></Field>
              <Field label="RAM max (MB)"><TextInput type="number" value={form.ramMaxMb} onChange={(event) => set("ramMaxMb", Number(event.target.value))} min={512} /></Field>
              <PortField value={form.port} onChange={(port) => set("port", port)} onStatusChange={setPortStatus} hint="ServerLab checks saved servers and active OS ports before creation." />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.2fr]">
              <div className="rounded border border-border bg-surface-console px-3 py-3"><Switch label="Auto-start on app launch" checked={form.autoStart ?? false} onChange={(checked) => set("autoStart", checked)} /></div>
              <label className="flex gap-3 rounded border border-border bg-surface-console px-3 py-3 text-sm">
                <input type="checkbox" checked={eulaAccepted} onChange={(event) => setEulaAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-copper" />
                <span className="leading-6 text-muted">I accept the <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer" className="font-semibold text-copper hover:text-copper-hover">Minecraft EULA</a>.</span>
              </label>
            </div>
            <SoftwareStatus cached={selectedBuild?.cached === true} selectedBuild={selectedBuild} progress={softwareProgress} onCancel={handleCancelSoftwareDownload} cancellable={loading && softwareProgress?.stage === "downloading"} />
          </>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-display text-lg font-semibold text-white">Creating server</p>
              <p className="mt-1 text-sm text-muted">ServerLab is resolving the software, verifying the cache, and installing the server files.</p>
            </div>
            <SoftwareStatus cached={selectedBuild?.cached === true} selectedBuild={selectedBuild} progress={softwareProgress} onCancel={handleCancelSoftwareDownload} cancellable={loading && softwareProgress?.stage === "downloading"} />
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button type="button" onClick={onClose} disabled={loading} icon={X} variant="secondary">Cancel</Button>
          <div className="flex gap-2">
            {step > 1 && <Button type="button" disabled={loading} onClick={() => { setError(null); setStep((current) => current - 1); }} variant="secondary">Back</Button>}
            {step < 4 ? <Button type="button" onClick={nextStep} variant="primary">Continue</Button> : step === 4 ? <Button type="submit" disabled={!canCreate} icon={loading ? Download : Plus} variant="primary">{loading ? "Creating..." : "Create server"}</Button> : <Button type="button" disabled icon={Download} variant="primary">Installing...</Button>}
          </div>
        </div>
      </form>
    </Modal>
  );
}

function JavaRuntimePanel({
  manualJava,
  setManualJava,
  javaPath,
  setJavaPath,
  recommendation,
  runtimes,
  selectedRuntimeId,
  setSelectedRuntimeId,
  progress,
  installing,
  onInstall,
  onCancelInstall,
  onScan,
}: {
  manualJava: boolean;
  setManualJava: (value: boolean) => void;
  javaPath: string;
  setJavaPath: (value: string) => void;
  recommendation: JavaRecommendationResponse | null;
  runtimes: JavaRuntime[];
  selectedRuntimeId: string;
  setSelectedRuntimeId: (id: string) => void;
  progress: JavaInstallProgressPayload | null;
  installing: boolean;
  onInstall: () => void;
  onCancelInstall: () => void;
  onScan: () => void;
}) {
  const percent = Math.round(progress?.percent ?? 0);
  const failed = progress?.status === "failed" || progress?.status === "cancelled";
  return (
    <div className="rounded border border-border bg-rail p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Coffee className="h-4 w-4 text-copper" aria-hidden="true" />
          <span className="font-semibold text-white">Java runtime</span>
          {recommendation && <span className="rounded border border-border bg-surface-console px-2 py-1 text-xs text-muted">Java {recommendation.requiredMajor} required</span>}
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={onScan} icon={RefreshCw} variant="secondary" size="sm">Scan</Button>
          {!manualJava && recommendation?.missing && (
            <Button type="button" onClick={onInstall} disabled={installing} icon={Download} variant="primary" size="sm">Install Java {recommendation.requiredMajor}</Button>
          )}
        </div>
      </div>

      {!manualJava ? (
        <Field label="Selected runtime">
          <Select value={selectedRuntimeId} onChange={(event) => setSelectedRuntimeId(event.target.value)}>
            <option value="">No compatible runtime selected</option>
            {runtimes.map((runtime) => (
              <option key={runtime.id} value={runtime.id}>
                Java {runtime.major} - {runtime.distribution} - {runtime.source}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field label="Manual Java executable">
          <TextInput value={javaPath} onChange={(event) => setJavaPath(event.target.value)} placeholder="java" />
        </Field>
      )}

      <div className="mt-3 rounded border border-border bg-surface-console px-3 py-3">
        <Switch label="Use manual Java path" checked={manualJava} onChange={setManualJava} />
      </div>

      {progress && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{stageLabels[progress.stage] ?? progress.stage}</span>
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
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{formatBytes(progress.bytesReceived)}{progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}</span>
            <span>{formatBytes(progress.speedBytesPerSec)}/s{progress.etaSeconds !== null ? `, ${formatDuration(progress.etaSeconds)} left` : ""}</span>
            {installing && <Button type="button" onClick={onCancelInstall} icon={X} variant="danger" size="sm">Cancel</Button>}
          </div>
          {progress.error && <p className="mt-2 text-xs text-redstone">{progress.error}</p>}
        </div>
      )}
    </div>
  );
}

function SoftwareStatus({
  cached,
  selectedBuild,
  progress,
  onCancel,
  cancellable,
}: {
  cached: boolean;
  selectedBuild?: SoftwareBuild;
  progress: SoftwareDownloadProgressPayload | null;
  onCancel: () => void;
  cancellable: boolean;
}) {
  const percent = Math.round(progress?.percent ?? 0);
  if (!progress) {
    return (
      <div className="flex items-center justify-between gap-3 rounded border border-border bg-rail px-3 py-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          {cached ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" /> : <Download className="h-4 w-4 shrink-0 text-copper" aria-hidden="true" />}
          <span className="truncate text-muted">{cached ? "Cached software available" : "Download required"}</span>
        </div>
        <span className="shrink-0 font-mono text-xs text-white">{selectedBuild?.id ?? "No build"}</span>
      </div>
    );
  }
  return (
    <div className="rounded border border-border bg-rail p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          {progress.status === "failed" || progress.status === "cancelled" ? <Ban className="h-4 w-4 shrink-0 text-redstone" aria-hidden="true" /> : <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-copper" aria-hidden="true" />}
          <span className="truncate font-semibold text-white">{stageLabels[progress.stage] ?? progress.stage}</span>
        </div>
        <span className="font-mono text-xs text-muted">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-console">
        <div className="h-full bg-copper transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{formatBytes(progress.bytesReceived)}{progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}</span>
        <span>{formatBytes(progress.speedBytesPerSec)}/s{progress.etaSeconds !== null ? `, ${formatDuration(progress.etaSeconds)} left` : ""}</span>
        {cancellable && <Button type="button" onClick={onCancel} icon={X} variant="danger" size="sm">Cancel</Button>}
      </div>
      {progress.error && <p className="mt-2 text-xs text-redstone">{progress.error}</p>}
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted">{label}</p><p className="mt-1 truncate font-semibold text-white">{value}</p></div>;
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
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}
