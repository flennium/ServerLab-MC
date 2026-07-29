import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { useServerStore } from "../store/serverStore.js";
import { StatusBadge } from "../components/ui/StatusBadge.js";
import { Console } from "../components/server/Console.js";
import { FileManager } from "../components/server/FileManager.js";
import { FileEditor } from "../components/server/FileEditor.js";
import { PerformanceMonitor } from "../components/server/PerformanceMonitor.js";
import { BackupPanel } from "../components/server/BackupPanel.js";

type Tab = "console" | "files" | "monitor" | "backups" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "console",  label: "Console"  },
  { id: "files",    label: "Files"    },
  { id: "monitor",  label: "Monitor"  },
  { id: "backups",  label: "Backups"  },
  { id: "settings", label: "Settings" },
];

interface OpenFile {
  path: string;
  name: string;
}

export function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, fetchServers, startServer, stopServer, restartServer, deleteServer } =
    useServerStore();

  const [tab, setTab] = useState<Tab>("console");
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const server = servers.find((s) => s.id === id);

  if (!server) {
    return (
      <div className="py-20 text-center text-muted">
        Server not found.{" "}
        <button onClick={() => navigate("/servers")} className="text-accent hover:underline">
          Back to servers
        </button>
      </div>
    );
  }

  const isActive = server.status === "running" || server.status === "starting";

  async function handleDelete() {
    if (!confirm(`Delete "${server!.name}"? A backup will be taken first.`)) return;
    await deleteServer(server!.id);
    navigate("/servers");
  }

  function handleOpenFile(filePath: string, fileName: string) {
    setOpenFile({ path: filePath, name: fileName });
    setTab("files");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{server.name}</h1>
            <StatusBadge status={server.status} />
          </div>
          <p className="mt-1 text-sm text-muted capitalize">
            {server.software} {server.version} · Port {server.port}
          </p>
        </div>

        {/* Controls */}
        <div className="flex gap-2 flex-wrap">
          {!isActive ? (
            <button
              onClick={() => startServer(server.id)}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              ▶ Start
            </button>
          ) : (
            <>
              <button
                onClick={() => stopServer(server.id)}
                className="rounded bg-surface-3 px-4 py-2 text-sm font-medium hover:bg-border transition-colors"
              >
                ⏹ Stop
              </button>
              <button
                onClick={() => restartServer(server.id)}
                className="rounded bg-surface-3 px-4 py-2 text-sm font-medium hover:bg-border transition-colors"
              >
                🔄 Restart
              </button>
            </>
          )}
          <button
            onClick={handleDelete}
            className="rounded bg-danger/20 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/30 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "RAM Min", value: `${server.ramMinMb} MB` },
          { label: "RAM Max", value: `${server.ramMaxMb} MB` },
          { label: "Port",    value: String(server.port) },
          { label: "Auto-start", value: server.autoStart ? "On" : "Off" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-surface-2 px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-0.5 font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Tab bar ── */}
      <div
        className="flex gap-0 border-b border-border"
        role="tablist"
        aria-label="Server sections"
      >
        {TABS.map(({ id: tid, label }) => (
          <button
            key={tid}
            role="tab"
            aria-selected={tab === tid}
            onClick={() => { setTab(tid); if (tid !== "files") setOpenFile(null); }}
            className={clsx(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              tab === tid
                ? "border-accent text-white"
                : "border-transparent text-muted hover:text-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab panels ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          {tab === "console" && <Console serverId={server.id} />}

          {tab === "files" && (
            <div className="flex flex-col gap-4">
              {openFile ? (
                <FileEditor
                  serverId={server.id}
                  filePath={openFile.path}
                  fileName={openFile.name}
                  onClose={() => setOpenFile(null)}
                />
              ) : null}
              <FileManager
                serverId={server.id}
                onOpenFile={handleOpenFile}
              />
            </div>
          )}

          {tab === "monitor" && (
            <PerformanceMonitor
              serverId={server.id}
              ramMaxMb={server.ramMaxMb}
            />
          )}

          {tab === "backups" && <BackupPanel serverId={server.id} />}

          {tab === "settings" && (
            <ServerSettings server={server} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Inline settings panel ────────────────────────────────────────────────────
import { api } from "../lib/apiClient.js";
import type { Server, UpdateServerDto } from "@serverlab/shared";

function ServerSettings({ server }: { server: Server }) {
  const { fetchServers } = useServerStore();
  const [form, setForm] = useState<UpdateServerDto>({
    name: server.name,
    javaPath: server.javaPath,
    ramMinMb: server.ramMinMb,
    ramMaxMb: server.ramMaxMb,
    port: server.port,
    startupArgs: server.startupArgs ?? "",
    autoStart: server.autoStart,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof UpdateServerDto>(key: K, value: UpdateServerDto[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/servers/${server.id}`, form);
      await fetchServers();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded border border-border bg-surface-3 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="max-w-lg flex flex-col gap-4">
      <Field label="Name">
        <input
          type="text"
          value={form.name ?? ""}
          onChange={(e) => set("name", e.target.value)}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="RAM min (MB)">
          <input
            type="number"
            value={form.ramMinMb}
            onChange={(e) => set("ramMinMb", Number(e.target.value))}
            className={inputCls}
          />
        </Field>
        <Field label="RAM max (MB)">
          <input
            type="number"
            value={form.ramMaxMb}
            onChange={(e) => set("ramMaxMb", Number(e.target.value))}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Port">
          <input
            type="number"
            value={form.port}
            onChange={(e) => set("port", Number(e.target.value))}
            className={inputCls}
          />
        </Field>
        <Field label="Java executable">
          <input
            type="text"
            value={form.javaPath ?? ""}
            onChange={(e) => set("javaPath", e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Extra startup arguments">
        <input
          type="text"
          value={form.startupArgs ?? ""}
          onChange={(e) => set("startupArgs", e.target.value)}
          placeholder="--nogui --noconsole"
          className={inputCls}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.autoStart ?? false}
          onChange={(e) => set("autoStart", e.target.checked)}
          className="accent-accent"
        />
        Auto-start on app launch
      </label>

      {error && (
        <p className="rounded bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saved && <span className="text-sm text-accent">✓ Saved</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}
