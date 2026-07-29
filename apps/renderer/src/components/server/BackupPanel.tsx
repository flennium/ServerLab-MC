import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../lib/apiClient.js";
import { getSocket } from "../../lib/socket.js";
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
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});

  async function fetchBackups() {
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
  }

  useEffect(() => {
    fetchBackups();

    // Listen for backup progress
    getSocket().then((socket) => {
      socket.on("backup:progress", ({ backupId, percent }) => {
        setProgress((p) => ({ ...p, [backupId]: percent }));
        if (percent >= 100) {
          setTimeout(() => {
            setProgress((p) => { const n = { ...p }; delete n[backupId]; return n; });
            fetchBackups();
          }, 1000);
        }
      });
    });
  }, [serverId]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      await api.post(`/api/servers/${serverId}/backups`, { type: "manual" });
      // Progress updates will trigger a re-fetch when done
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed");
      setCreating(false);
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(backupId: string, name: string) {
    if (!confirm(`Restore "${name}"? A safety backup will be taken first.`)) return;
    setRestoring(backupId);
    setError(null);
    try {
      await api.post(`/api/backups/${backupId}/restore`);
      fetchBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Backups</h3>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {creating ? "Creating…" : "+ Create Backup"}
        </button>
      </div>

      {error && (
        <p className="rounded bg-danger/20 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {/* In-progress backups */}
      <AnimatePresence>
        {Object.entries(progress).map(([backupId, pct]) => (
          <motion.div
            key={backupId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded border border-border bg-surface-2 px-3 py-2"
          >
            <p className="mb-1.5 text-xs text-muted">
              Backup in progress — {pct}%
            </p>
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Backup list */}
      {loading && (
        <p className="text-center text-xs text-muted py-4">Loading…</p>
      )}
      {!loading && backups.length === 0 && (
        <p className="text-center text-xs text-muted py-6">
          No backups yet — create one above.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {backups.map((backup) => (
          <div
            key={backup.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5"
          >
            <div>
              <p className="text-xs font-medium">
                {formatDate(backup.createdAt)}
                <span className="ml-2 capitalize text-muted">
                  ({backup.type})
                </span>
              </p>
              <p className="text-xs text-muted">{formatBytes(backup.sizeBytes)}</p>
            </div>
            <button
              onClick={() =>
                handleRestore(backup.id, formatDate(backup.createdAt))
              }
              disabled={restoring === backup.id}
              className="rounded bg-surface-3 px-3 py-1 text-xs font-medium hover:bg-border disabled:opacity-50 transition-colors"
            >
              {restoring === backup.id ? "Restoring…" : "Restore"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
