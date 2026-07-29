import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/apiClient.js";
import { getSocket } from "../../lib/socket.js";
import { ConfirmModal } from "../ui/ConfirmModal.js";
import type { Backup, BackupListResponse } from "@serverlab/shared";

interface BackupPanelProps {
  serverId: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDate(iso: string | Date) {
  return new Date(iso).toLocaleString();
}

export function BackupPanel({ serverId }: BackupPanelProps) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<Backup | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Backup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const { backups } = await api.get<BackupListResponse>(
        `/api/servers/${serverId}/backups`
      );
      setBackups(backups);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load backups");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchBackups();

    // ✅ Proper cleanup — store the off handler returned from socket.on
    let cleanup = () => {};
    getSocket().then((socket) => {
      const handler = ({ backupId, percent }: { backupId: string; percent: number }) => {
        setProgress((p) => ({ ...p, [backupId]: percent }));
        if (percent >= 100) {
          setTimeout(() => {
            setProgress((p) => { const n = { ...p }; delete n[backupId]; return n; });
            fetchBackups();
            setCreating(false);
          }, 1200);
        }
      };
      socket.on("backup:progress", handler);
      cleanup = () => socket.off("backup:progress", handler);
    });

    return () => cleanup();
  }, [serverId, fetchBackups]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      await api.post(`/api/servers/${serverId}/backups`, { type: "manual" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
      setCreating(false);
    }
  }

  async function handleRestore(backup: Backup) {
    setRestoring(backup.id);
    setConfirmRestore(null);
    setError(null);
    try {
      await api.post(`/api/backups/${backup.id}/restore`);
      fetchBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(null);
    }
  }

  async function handleDelete(backup: Backup) {
    setDeleting(backup.id);
    setConfirmDelete(null);
    try {
      await api.delete(`/api/backups/${backup.id}`);
      setBackups((b) => b.filter((x) => x.id !== backup.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Backups
            {backups.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted">({backups.length})</span>
            )}
          </h3>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {creating ? "Creating…" : "+ Create Backup"}
          </button>
        </div>

        {error && (
          <div className="flex items-center justify-between rounded bg-danger/20 px-3 py-2 text-xs text-danger">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-muted hover:text-white">✕</button>
          </div>
        )}

        {/* In-progress bars */}
        <AnimatePresence>
          {Object.entries(progress).map(([backupId, pct]) => (
            <motion.div
              key={backupId}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded border border-border bg-surface-2 px-3 py-2 overflow-hidden"
            >
              <div className="flex justify-between mb-1.5">
                <span className="text-xs text-muted">Backup in progress</span>
                <span className="text-xs font-semibold tabular-nums">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Restore in progress */}
        {restoring && (
          <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Restoring backup… please wait.
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-3" />
            ))}
          </div>
        ) : backups.length === 0 ? (
          <p className="text-center text-xs text-muted py-8">
            No backups yet — create one above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5 gap-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">
                    {formatDate(backup.createdAt)}
                    <span className="ml-2 capitalize text-muted font-normal">
                      ({backup.type})
                    </span>
                  </p>
                  <p className="text-xs text-muted mt-0.5">{formatBytes(backup.sizeBytes)}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setConfirmRestore(backup)}
                    disabled={restoring === backup.id || !!restoring}
                    className="rounded bg-surface-3 px-3 py-1 text-xs font-medium hover:bg-border disabled:opacity-40 transition-colors"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => setConfirmDelete(backup)}
                    disabled={deleting === backup.id}
                    className="rounded bg-danger/20 px-2 py-1 text-xs text-danger hover:bg-danger/30 disabled:opacity-40 transition-colors"
                    title="Delete backup"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Restore confirm */}
      {confirmRestore && (
        <ConfirmModal
          title="Restore this backup?"
          message={`This will overwrite the current server files with the backup from ${formatDate(confirmRestore.createdAt)}. A safety backup will be taken first.`}
          confirmLabel="Restore"
          onConfirm={() => handleRestore(confirmRestore)}
          onCancel={() => setConfirmRestore(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <ConfirmModal
          title="Delete this backup?"
          message={`The backup from ${formatDate(confirmDelete.createdAt)} (${formatBytes(confirmDelete.sizeBytes)}) will be permanently deleted.`}
          confirmLabel="Delete backup"
          danger
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
