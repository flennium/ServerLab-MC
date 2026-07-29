import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { api } from "../../lib/apiClient.js";
import type { FileEntry, FileListResponse } from "@serverlab/shared";

interface FileManagerProps {
  serverId: string;
  onOpenFile: (path: string, name: string) => void;
}

export function FileManager({ serverId, onOpenFile }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const load = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const { entries } = await api.get<FileListResponse>(
          `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`
        );
        setEntries(entries);
        setCurrentPath(path);
        setSelected(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load directory");
      } finally {
        setLoading(false);
      }
    },
    [serverId]
  );

  useEffect(() => {
    load("");
  }, [load]);

  function breadcrumbs() {
    const parts = currentPath.split("/").filter(Boolean);
    return [{ label: "root", path: "" }, ...parts.map((p, i) => ({
      label: p,
      path: parts.slice(0, i + 1).join("/"),
    }))];
  }

  async function handleDelete(entry: FileEntry) {
    if (!confirm(`Delete "${entry.name}"?`)) return;
    try {
      await api.delete(
        `/api/servers/${serverId}/files?path=${encodeURIComponent(entry.path)}`
      );
      load(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const newPath = currentPath
      ? `${currentPath}/${newFolderName}`
      : newFolderName;
    try {
      // We create a placeholder .keep file — real folder creation via writeFile
      await api.put(`/api/servers/${serverId}/files`, {
        path: `${newPath}/.keep`,
        content: "",
      });
      setNewFolderMode(false);
      setNewFolderName("");
      load(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create folder failed");
    }
  }

  const EDITABLE_EXTS = [".yml", ".yaml", ".json", ".properties", ".txt", ".conf", ".toml"];
  const isEditable = (name: string) =>
    EDITABLE_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-[#0a0a0a] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-muted flex-1 min-w-0 overflow-x-auto">
          {breadcrumbs().map((crumb, i, arr) => (
            <span key={crumb.path} className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => load(crumb.path)}
                className={clsx(
                  "hover:text-white transition-colors",
                  i === arr.length - 1 ? "text-white" : "text-muted"
                )}
              >
                {crumb.label}
              </button>
              {i < arr.length - 1 && <span className="text-border">/</span>}
            </span>
          ))}
        </div>

        {/* Actions */}
        <button
          onClick={() => setNewFolderMode(true)}
          className="rounded bg-surface-3 px-2 py-1 text-xs hover:bg-border transition-colors shrink-0"
          title="New folder"
        >
          + Folder
        </button>
        <button
          onClick={() => load(currentPath)}
          className="rounded bg-surface-3 px-2 py-1 text-xs hover:bg-border transition-colors shrink-0"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* New folder input */}
      <AnimatePresence>
        {newFolderMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-center gap-2 px-3 py-2 border-b border-border overflow-hidden"
          >
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setNewFolderMode(false);
              }}
              placeholder="folder-name"
              className="flex-1 rounded border border-border bg-surface-3 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={handleCreateFolder}
              className="rounded bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover"
            >
              Create
            </button>
            <button
              onClick={() => setNewFolderMode(false)}
              className="text-xs text-muted hover:text-white"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File list */}
      <div className="overflow-y-auto" style={{ minHeight: 240, maxHeight: 360 }}>
        {loading && (
          <p className="px-4 py-6 text-center text-xs text-muted">Loading…</p>
        )}
        {error && (
          <p className="px-4 py-3 text-xs text-danger">{error}</p>
        )}
        {!loading && entries.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted">
            Empty directory
          </p>
        )}

        {entries.map((entry) => (
          <div
            key={entry.path}
            onClick={() => setSelected(entry.path)}
            onDoubleClick={() => {
              if (entry.isDirectory) load(entry.path);
              else if (isEditable(entry.name)) onOpenFile(entry.path, entry.name);
            }}
            className={clsx(
              "flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer select-none",
              "hover:bg-surface-2 transition-colors",
              selected === entry.path && "bg-surface-2"
            )}
          >
            {/* Icon */}
            <span className="shrink-0 text-base" aria-hidden="true">
              {entry.isDirectory ? "📁" : getFileIcon(entry.name)}
            </span>

            {/* Name / rename input */}
            {renaming === entry.path ? (
              <input
                autoFocus
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter") {
                    // Rename via backend (future endpoint) — for now just dismiss
                    setRenaming(null);
                  }
                  if (e.key === "Escape") setRenaming(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 rounded border border-accent bg-surface-3 px-1 text-xs focus:outline-none"
              />
            ) : (
              <span className="flex-1 truncate font-mono text-xs">
                {entry.name}
              </span>
            )}

            {/* Size */}
            {!entry.isDirectory && entry.sizeBytes != null && (
              <span className="text-xs text-muted shrink-0">
                {formatBytes(entry.sizeBytes)}
              </span>
            )}

            {/* Row actions (show on hover via group) */}
            <div
              className="ml-2 flex gap-1 opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              {isEditable(entry.name) && !entry.isDirectory && (
                <button
                  onClick={() => onOpenFile(entry.path, entry.name)}
                  className="rounded px-1.5 py-0.5 text-xs text-muted hover:text-white hover:bg-surface-3"
                  title="Edit"
                >
                  ✎
                </button>
              )}
              <button
                onClick={() => {
                  setRenaming(entry.path);
                  setRenameValue(entry.name);
                }}
                className="rounded px-1.5 py-0.5 text-xs text-muted hover:text-white hover:bg-surface-3"
                title="Rename"
              >
                ✏
              </button>
              <button
                onClick={() => handleDelete(entry)}
                className="rounded px-1.5 py-0.5 text-xs text-muted hover:text-danger hover:bg-surface-3"
                title="Delete"
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileIcon(name: string): string {
  if (name.endsWith(".yml") || name.endsWith(".yaml")) return "📄";
  if (name.endsWith(".json")) return "📋";
  if (name.endsWith(".properties")) return "⚙";
  if (name.endsWith(".log")) return "📜";
  if (name.endsWith(".jar")) return "☕";
  if (name.endsWith(".zip")) return "📦";
  return "📄";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
