import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Archive, RotateCcw, Trash2, X } from "lucide-react";
import { api } from "../../lib/apiClient.js";
import { getSocket } from "../../lib/socket.js";
import { ConfirmModal } from "../ui/ConfirmModal.js";
import { Alert, Card, DangerZone, EmptyState } from "../ui/Layout.js";
import { Button, IconButton } from "../ui/Button.js";
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
  const reduceMotion = useReducedMotion();

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const { backups } = await api.get<BackupListResponse>(
        `/api/servers/${serverId}/backups`
      );
      setBackups(backups);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load backups");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchBackups();

    let cleanup = () => {};
    getSocket().then((socket) => {
      const handler = ({ backupId, percent }: { backupId: string; percent: number }) => {
        setProgress((current) => ({ ...current, [backupId]: percent }));
        if (percent >= 100) {
          setTimeout(() => {
            setProgress((current) => {
              const next = { ...current };
              delete next[backupId];
              return next;
            });
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
    } catch (error) {
      setError(error instanceof Error ? error.message : "Backup failed");
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
    } catch (error) {
      setError(error instanceof Error ? error.message : "Restore failed");
    } finally {
      setRestoring(null);
    }
  }

  async function handleDelete(backup: Backup) {
    setDeleting(backup.id);
    setConfirmDelete(null);
    try {
      await api.delete(`/api/backups/${backup.id}`);
      setBackups((current) => current.filter((item) => item.id !== backup.id));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Backups</h2>
            <p className="mt-1 text-sm text-muted">
              {backups.length} saved restore points for this server.
            </p>
          </div>
          <Button onClick={handleCreate} disabled={creating} icon={Archive} variant="primary">
            {creating ? "Creating..." : "Create backup"}
          </Button>
        </div>

        {error && (
          <Alert
            tone="danger"
            autoDismissMs={8000}
            dismissKey={error}
            onDismiss={() => setError(null)}
            action={<IconButton icon={X} label="Dismiss backup error" onClick={() => setError(null)} />}
          >
            {error}
          </Alert>
        )}

        <AnimatePresence>
          {Object.entries(progress).map(([backupId, pct]) => (
            <motion.div
              key={backupId}
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="overflow-hidden"
            >
              <Card className="px-4 py-3">
                <div className="mb-2 flex justify-between text-xs">
                  <span className="font-semibold text-muted">Backup in progress</span>
                  <span className="font-mono font-semibold text-white">{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-rail">
                  <div
                    className="h-full rounded-full bg-copper transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        {restoring && <Alert tone="warning">Restoring backup. Keep the app open until it finishes.</Alert>}

        {loading ? (
          <div className="flex flex-col gap-2">
            <div className="h-16 animate-pulse rounded-lg bg-rail" />
            <div className="h-16 animate-pulse rounded-lg bg-rail" />
          </div>
        ) : backups.length === 0 ? (
          <EmptyState
            icon={<Archive className="h-10 w-10" aria-hidden="true" />}
            title="No backups yet"
            description="Create a manual backup before risky file edits, upgrades, or plugin experiments."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {backups.map((backup) => (
              <Card key={backup.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {formatDate(backup.createdAt)}
                      <span className="ml-2 font-normal capitalize text-muted">({backup.type})</span>
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted">{formatBytes(backup.sizeBytes)}</p>
                  </div>
                  <DangerZone
                    title="Backup actions"
                    description="Restore overwrites current files. Delete permanently removes this backup."
                    compact
                  >
                    <Button
                      onClick={() => setConfirmRestore(backup)}
                      disabled={restoring === backup.id || !!restoring}
                      icon={RotateCcw}
                      variant="secondary"
                      size="sm"
                    >
                      Restore
                    </Button>
                    <IconButton
                      icon={Trash2}
                      label="Delete backup"
                      variant="danger"
                      disabled={deleting === backup.id}
                      onClick={() => setConfirmDelete(backup)}
                    />
                  </DangerZone>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {confirmRestore && (
        <ConfirmModal
          title="Restore this backup?"
          message={`This will overwrite the current server files with the backup from ${formatDate(confirmRestore.createdAt)}. A safety backup will be taken first.`}
          confirmLabel="Restore"
          onConfirm={() => handleRestore(confirmRestore)}
          onCancel={() => setConfirmRestore(null)}
        />
      )}

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
