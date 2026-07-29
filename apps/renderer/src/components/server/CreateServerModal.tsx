import { useState, type FormEvent } from "react";
import { Modal } from "../ui/Modal.js";
import { useServerStore } from "../../store/serverStore.js";
import type { CreateServerDto, ServerSoftware } from "@serverlab/shared";

const SOFTWARE_OPTIONS: ServerSoftware[] = ["paper", "purpur", "spigot", "fabric"];

interface CreateServerModalProps {
  onClose: () => void;
}

export function CreateServerModal({ onClose }: CreateServerModalProps) {
  const { createServer } = useServerStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CreateServerDto>({
    name: "",
    path: "",
    version: "1.21.1",
    software: "paper",
    javaPath: "java",
    ramMinMb: 1024,
    ramMaxMb: 4096,
    port: 25565,
    autoStart: false,
  });

  function set<K extends keyof CreateServerDto>(key: K, value: CreateServerDto[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleBrowse() {
    if (typeof window !== "undefined" && window.serverlab) {
      const chosen = await window.serverlab.openDirectoryDialog();
      if (chosen) set("path", chosen);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) return setError("Name is required.");
    if (!form.path.trim()) return setError("Server folder is required.");

    try {
      setLoading(true);
      await createServer(form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="New Server" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Name */}
        <Field label="Name" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Survival Development"
            className={inputCls}
            required
          />
        </Field>

        {/* Server folder */}
        <Field label="Server folder" required>
          <div className="flex gap-2">
            <input
              type="text"
              value={form.path}
              onChange={(e) => set("path", e.target.value)}
              placeholder="C:\servers\survival"
              className={`${inputCls} flex-1`}
              required
            />
            <button
              type="button"
              onClick={handleBrowse}
              className="rounded bg-surface-3 px-3 text-sm hover:bg-border transition-colors"
            >
              Browse
            </button>
          </div>
        </Field>

        {/* Software + Version row */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Software">
            <select
              value={form.software}
              onChange={(e) => set("software", e.target.value as ServerSoftware)}
              className={inputCls}
            >
              {SOFTWARE_OPTIONS.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Version">
            <input
              type="text"
              value={form.version}
              onChange={(e) => set("version", e.target.value)}
              placeholder="1.21.1"
              className={inputCls}
            />
          </Field>
        </div>

        {/* RAM row */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="RAM min (MB)">
            <input
              type="number"
              value={form.ramMinMb}
              onChange={(e) => set("ramMinMb", Number(e.target.value))}
              min={512}
              className={inputCls}
            />
          </Field>
          <Field label="RAM max (MB)">
            <input
              type="number"
              value={form.ramMaxMb}
              onChange={(e) => set("ramMaxMb", Number(e.target.value))}
              min={512}
              className={inputCls}
            />
          </Field>
        </div>

        {/* Port + Java */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Port">
            <input
              type="number"
              value={form.port}
              onChange={(e) => set("port", Number(e.target.value))}
              min={1024}
              max={65535}
              className={inputCls}
            />
          </Field>
          <Field label="Java executable">
            <input
              type="text"
              value={form.javaPath}
              onChange={(e) => set("javaPath", e.target.value)}
              placeholder="java"
              className={inputCls}
            />
          </Field>
        </div>

        {/* Auto-start */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.autoStart}
            onChange={(e) => set("autoStart", e.target.checked)}
            className="accent-accent"
          />
          Auto-start on app launch
        </label>

        {error && (
          <p className="rounded bg-danger/20 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-surface-3 px-4 py-2 text-sm font-medium hover:bg-border transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create Server"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded border border-border bg-surface-3 px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}
