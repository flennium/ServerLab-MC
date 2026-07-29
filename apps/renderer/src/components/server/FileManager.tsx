import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { api } from "../../lib/apiClient.js";
import { ConfirmModal } from "../ui/ConfirmModal.js";
import type { FileEntry, FileListResponse } from "@serverlab/shared";

interface FileManagerProps {
  serverId: string;
  onOpenFile: (path: string, name: string) => void;
}

interface PendingDelete {
  entry: FileEntry;
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
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

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

  useEffect(() => { load(""); }, [load]);

  function breadcrumbs() {
    const parts = currentPath.split("/").filter(Boolean);
    return [
      { label: "root", path: "" },
      ...parts.map((p, i) => ({ label: p, path: parts.slice(0, i + 1).join("/") })),
    ];
  }

  async function handleDelete(entry: FileEntry) {
    try {
      await api.delete(
        `/api/servers/${serverId}/files?path=${encodeURIComponent(entry.path)}`
      );
      setPendingDelete(null);
      load(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setPendingDelete(null);
    }
  }

  async function handleRename(entry: FileEntry, newName: string) {
    const dir = entry.path.includes("/")
      ? entry.path.substring(0, entry.path.lastIndexOf("/"))
      : "";
    const newPath = dir ? `${dir}/${newName}` : newName;
    try {
      await api.patch(`/api/servers/${serverId}/files/rename`, {
        oldPath: entry.path,
        newPath,
      });
      setRenaming(null);
      load(currentPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
      setRenaming(null);
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const newPath = currentPath ? `${currentPath}/${newFolderName}` : newFolderName;
    try {
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

  const EDITABLE_EXTS = [".yml", ".yaml", ".json", ".properties", ".txt", ".conf", ".toml", ".ini"];
  const isEditable = (name: string) =>
    EDITABLE_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

  return (
    <>
      <div className="flex flex-col gap-0 rounded-lg border border-border bg-surface-console overflow-hidden">
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
                    i === arr.length - 1 ? "text-white font-medium" : "text-muted"
                  )}
                >
                  {crumb.label}
                </button>
                {i < arr.length - 1 && <span className="text-border">/</span>}
              </span>
            ))}
          </div>

          <button
            onClick={() => setNewFolderMode(true)}
            className="rounded bg-surface-3 px-2 py-1 text-xs hover:bg-border transition-colors shrink-0"
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
              className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-2 overflow-hidden"
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
              <button onClick={handleCreateFolder} className="rounded bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover">
                Create
              </button>
              <button onClick={() => setNewFolderMode(false)} className="text-xs text-muted hover:text-white">
                Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error banner */}
        {error && (
          <div className="flex items-center justify-between bg-danger/10 border-b border-danger/20 px-3 py-2 text-xs text-danger">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-muted hover:text-white">✕</button>
          </div>
        )}

        {/* File list */}
        <div className="overflow-y-auto" style={{ minHeight: 240, maxHeight: 420 }}>
          {loading && (
            <div className="flex flex-col gap-1 p-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-7 animate-pulse rounded bg-surface-3" />
              ))}
            </div>
          )}

          {!loading && entries.length === 0 && !error && (
            <p className="px-4 py-8 text-center text-xs text-muted">Empty directory</p>
          )}

          {!loading && entries.map((entry) => (
            <div
              key={entry.path}
              onClick={() => setSelected(entry.path)}
              onDoubleClick={() => {
                if (entry.isDirectory) load(entry.path);
                else if (isEditable(entry.name)) onOpenFile(entry.path, entry.name);
              }}
              className={clsx(
                // ✅ `group` class is here so group-hover works on action buttons
                "group flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer select-none",
                "hover:bg-surface-2 transition-colors",
                selected === entry.path && "bg-surface-2"
              )}
            >
              {/* Icon */}
              <span className="shrink-0 w-4 text-center text-sm" aria-hidden="true">
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
                    if (e.key === "Enter" && renameValue.trim()) {
                      await handleRename(entry, renameValue.trim());
                    }
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={() => setRenaming(null)}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 rounded border border-accent bg-surface-3 px-1.5 py-0.5 text-xs font-mono focus:outline-none"
                />
              ) : (
                <span className="flex-1 truncate font-mono text-xs">{entry.name}</span>
              )}

              {/* Size */}
              {!entry.isDirectory && entry.sizeBytes != null && (
                <span className="text-xs text-muted shrink-0 w-14 text-right">
                  {formatBytes(entry.sizeBytes)}
                </span>
              )}

              {/* ✅ Row actions — now visible because parent has `group` class */}
              <div
                className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {isEditable(entry.name) && !entry.isDirectory && (
                  <ActionBtn
                    title="Edit"
                    onClick={() => onOpenFile(entry.path, entry.name)}
                  >
                    ✎
                  </ActionBtn>
                )}
                {entry.isDirectory && (
                  <ActionBtn title="Open" onClick={() => load(entry.path)}>→</ActionBtn>
                )}
                <ActionBtn
                  title="Rename"
                  onClick={() => { setRenaming(entry.path); setRenameValue(entry.name); }}
                >
                  ✏
                </ActionBtn>
                <ActionBtn
                  title="Delete"
                  danger
                  onClick={() => setPendingDelete({ entry })}
                >
                  🗑
                </ActionBtn>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Delete confirmation */}
      {pendingDelete && (
        <ConfirmModal
          title={`Delete "${pendingDelete.entry.name}"?`}
          message={
            pendingDelete.entry.isDirectory
              ? "This will delete the folder and all its contents. This cannot be undone."
              : "This file will be permanently deleted."
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(pendingDelete.entry)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionBtn({
  children,
  title,
  danger,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={clsx(
        "rounded px-1.5 py-0.5 text-xs transition-colors",
        danger
          ? "text-muted hover:text-danger hover:bg-surface-3"
          : "text-muted hover:text-white hover:bg-surface-3"
      )}
    >
      {children}
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const icons: Record<string, string> = {
    yml: "📄", yaml: "📄",
    json: "📋",
    properties: "⚙", conf: "⚙", ini: "⚙", toml: "⚙",
    log: "📜",
    jar: "☕",
    zip: "📦",
    txt: "📝",
  };
  return icons[ext ?? ""] ?? "📄";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
