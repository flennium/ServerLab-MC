import { useEffect, useState } from "react";
import { useJavaStore } from "../store/javaStore.js";
import { api } from "../lib/apiClient.js";

export function JavaManagerPage() {
  const { versions, loading, fetchVersions, detectVersions } = useJavaStore();
  const [installing, setInstalling] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  async function handleInstall(major: number) {
    setInstalling(major);
    setError(null);
    setInstallMsg(null);
    try {
      const res = await api.post<{ message: string }>("/api/java/install", { major });
      setInstallMsg(res.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setInstalling(null);
    }
  }

  const RECOMMENDED = [8, 17, 21];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Java Manager</h1>
          <p className="mt-1 text-sm text-muted">
            Manage JDK installations used to run your servers.
          </p>
        </div>
        <button
          onClick={detectVersions}
          disabled={loading}
          className="rounded bg-surface-3 px-4 py-2 text-sm font-medium hover:bg-border disabled:opacity-50 transition-colors"
        >
          {loading ? "Scanning…" : "↻ Scan system"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded bg-danger/20 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {installMsg && (
        <div className="mb-4 rounded bg-accent/20 px-4 py-2 text-sm text-accent">
          {installMsg}
        </div>
      )}

      {/* Detected versions */}
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">
          Detected on this machine
        </h2>
        {versions.length === 0 && !loading ? (
          <p className="text-sm text-muted">
            No JDKs found — click "Scan system" or install one below.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3"
              >
                <div>
                  <span className="font-semibold">Java {v.major}</span>
                  <span className="ml-3 font-mono text-xs text-muted">
                    {v.path}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {v.vendor && (
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted capitalize">
                      {v.vendor}
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      v.detected
                        ? "bg-accent/20 text-accent"
                        : "bg-surface-3 text-muted"
                    }`}
                  >
                    {v.detected ? "Detected" : "Manual"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Download section */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">
          Download via Adoptium
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {RECOMMENDED.map((major) => {
            const alreadyHave = versions.some((v) => v.major === major);
            return (
              <div
                key={major}
                className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-2 p-4"
              >
                <div className="text-3xl">☕</div>
                <div className="text-center">
                  <p className="font-semibold">Java {major}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {major === 8
                      ? "Legacy (1.8–1.16)"
                      : major === 17
                      ? "Recommended (1.17–1.20)"
                      : "Latest (1.21+)"}
                  </p>
                </div>
                {alreadyHave ? (
                  <span className="rounded-full bg-accent/20 px-3 py-1 text-xs text-accent">
                    ✓ Installed
                  </span>
                ) : (
                  <button
                    onClick={() => handleInstall(major)}
                    disabled={installing === major}
                    className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {installing === major ? "Queued…" : "Download"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          Full download support (auto-extract, path registration) ships in v2.1.
          Downloads are queued via the Adoptium API.
        </p>
      </section>
    </div>
  );
}
