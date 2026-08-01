import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../lib/apiClient.js";
import { ConfirmModal } from "../ui/ConfirmModal.js";
import { Alert } from "../ui/Layout.js";
import { Button, IconButton } from "../ui/Button.js";
import { TextInput } from "../ui/Form.js";
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
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to load directory");
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
    return [
      { label: "root", path: "" },
      ...parts.map((part, index) => ({
        label: part,
        path: parts.slice(0, index + 1).join("/"),
      })),
    ];
  }

  async function handleDelete(entry: FileEntry) {
    try {
      await api.delete(`/api/servers/${serverId}/files?path=${encodeURIComponent(entry.path)}`);
      setPendingDelete(null);
      load(currentPath);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Delete failed");
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
    } catch (error) {
      setError(error instanceof Error ? error.message : "Rename failed");
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
    } catch (error) {
      setError(error instanceof Error ? error.message : "Create folder failed");
    }
  }

  const editableExts = [".yml", ".yaml", ".json", ".properties", ".txt", ".conf", ".toml", ".ini"];
  const isEditable = (name: string) =>
    editableExts.some((extension) => name.toLowerCase().endsWith(extension));

  return (
    <>
      <div className="flex min-h-[460px] flex-col overflow-hidden rounded-lg border border-border bg-panel">
        <div className="flex items-center gap-2 border-b border-border bg-carbon px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs text-muted">
            {breadcrumbs().map((crumb, index, crumbs) => (
              <span key={crumb.path || "root"} className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => load(crumb.path)}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-rail hover:text-white",
                    index === crumbs.length - 1 && "text-white"
                  )}
                >
                  {index === 0 && <Home className="h-3.5 w-3.5" aria-hidden="true" />}
                  {crumb.label}
                </button>
                {index < crumbs.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 text-border" aria-hidden="true" />
                )}
              </span>
            ))}
          </div>

          <Button
            onClick={() => setNewFolderMode(true)}
            icon={FolderPlus}
            variant="secondary"
            size="sm"
          >
            Folder
          </Button>
          <IconButton icon={RefreshCw} label="Refresh files" onClick={() => load(currentPath)} />
        </div>

        <AnimatePresence>
          {newFolderMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-border bg-surface-console"
            >
              <div className="flex items-center gap-2 px-3 py-3">
                <TextInput
                  autoFocus
                  type="text"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleCreateFolder();
                    if (event.key === "Escape") setNewFolderMode(false);
                  }}
                  placeholder="folder-name"
                  className="h-8 flex-1 py-1 text-xs"
                />
                <Button onClick={handleCreateFolder} variant="primary" size="sm">
                  Create
                </Button>
                <IconButton icon={X} label="Cancel folder creation" onClick={() => setNewFolderMode(false)} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <Alert
            tone="danger"
            className="m-3"
            action={<IconButton icon={X} label="Dismiss file error" onClick={() => setError(null)} />}
          >
            {error}
          </Alert>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col gap-1 p-2">
              {[1, 2, 3, 4, 5].map((index) => (
                <div key={index} className="h-9 animate-pulse rounded bg-rail" />
              ))}
            </div>
          )}

          {!loading && entries.length === 0 && !error && (
            <p className="px-4 py-10 text-center text-sm text-muted">Empty directory</p>
          )}

          {!loading &&
            entries.map((entry) => (
              <div
                key={entry.path}
                onClick={() => setSelected(entry.path)}
                onDoubleClick={() => {
                  if (entry.isDirectory) load(entry.path);
                  else if (isEditable(entry.name)) onOpenFile(entry.path, entry.name);
                }}
                className={clsx(
                  "group grid cursor-pointer select-none grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-sm transition-colors",
                  "hover:bg-rail",
                  selected === entry.path && "bg-rail"
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileGlyph entry={entry} />
                  {renaming === entry.path ? (
                    <TextInput
                      autoFocus
                      type="text"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={async (event) => {
                        if (event.key === "Enter" && renameValue.trim()) {
                          await handleRename(entry, renameValue.trim());
                        }
                        if (event.key === "Escape") setRenaming(null);
                      }}
                      onBlur={() => setRenaming(null)}
                      onClick={(event) => event.stopPropagation()}
                      className="h-7 flex-1 py-1 font-mono text-xs"
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-white">
                      {entry.name}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!entry.isDirectory && entry.sizeBytes != null && (
                    <span className="hidden w-16 shrink-0 text-right font-mono text-xs text-muted sm:inline">
                      {formatBytes(entry.sizeBytes)}
                    </span>
                  )}
                  <div
                    className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {isEditable(entry.name) && !entry.isDirectory && (
                      <IconButton
                        icon={Pencil}
                        label="Edit file"
                        onClick={() => onOpenFile(entry.path, entry.name)}
                      />
                    )}
                    {entry.isDirectory && (
                      <IconButton icon={FolderOpen} label="Open folder" onClick={() => load(entry.path)} />
                    )}
                    <IconButton
                      icon={Pencil}
                      label="Rename"
                      onClick={() => {
                        setRenaming(entry.path);
                        setRenameValue(entry.name);
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Delete"
                      variant="danger"
                      onClick={() => setPendingDelete({ entry })}
                    />
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

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

function FileGlyph({ entry }: { entry: FileEntry }) {
  if (entry.isDirectory) {
    return <Folder className="h-4 w-4 shrink-0 text-copper" aria-hidden="true" />;
  }

  const ext = entry.name.split(".").pop()?.toLowerCase();
  const codeLike = ["yml", "yaml", "json", "properties", "conf", "ini", "toml", "js", "ts"].includes(
    ext ?? ""
  );
  const Icon = codeLike ? FileCode2 : FileText;
  return <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
