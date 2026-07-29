import { useEffect, useState } from "react";
import { useJavaStore } from "../store/javaStore.js";
import { api } from "../lib/apiClient.js";
import { getSocket } from "../lib/socket.js";
import { Skeleton } from "../components/ui/Skeleton.js";

export function JavaManagerPage() {
  const { versions, loading, fetchVersions, detectVersions } = useJavaStore();
  const [installing, setInstalling] = useState<number | null>(null);
  const [installProgress, setInstallProgress] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchVersions();

    // Listen for download progress from a future full JDK installer
    let cleanup = () => {};
    getSocket().then((socket) => {
      const handler = ({ templateId, percent }: { templateId: string; percent: number }) => {
        // JDK installs reuse the template:progress event with templateId = `jdk-${major}`
        const match = templateId.match(/^jdk-(\d+)$/);
        if (!match) return;
        const major = parseInt(match[1], 10);
        setInstallProgress((p) => ({ ...p, [major]: percent }));
        if (percent >= 100) {
          setTimeout(() => {
            setInstallProgress((p) => { const n = { ...p }; delete n[major]; return n; });
            fetchVersions();
            setInstalling(null);
          }, 1200);
        }
      };
      socket.on("template:progress", handler);
      cleanup = () => socket.off("template:progress", handler);
    });

    return () => cleanup();
  }, [fetchVersions]);

  async function handleInstall(major: number) {
    setInstalling(major);
    setError(null);
    setInstallMsg(null);
    try {
      const res = await api.post<{ message: string }>("/api/java/install", { major });
      setInstallMsg(res.message);
      // If no socket progress comes, clear after 3s
      setTimeout(() => {
        setInstalling((cur) => (cur === major ? null : cur));
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
      setInstalling(null);
    }
  }

  const RECOMMENDED = [
    { major: 8,  label: "Java 8",  desc: "Legacy — Minecraft 1.8–1.16" },
    { major: 17, label: "Java 17", desc: "Recommended — 1.17–1.20" },
    { major: 21, label: "Java 21", desc: "Latest — 1.21+" },
  ];

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
        <div className="mb-4 flex items-center justify-between rounded border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
          <button onClick={() => setError(null)} className="text-muted hover:text-white">✕</button>
        </div>
      )}
      {installMsg && (
        <div className="mb-4 rounded border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent">
          {installMsg}
        </div>
      )}

      {/* Detected versions */}
      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
          Detected on this machine
        </h2>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : versions.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-5 text-sm text-muted text-center">
            No JDKs detected — click "Scan system" or download one below.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <span className="font-semibold">Java {v.major}</span>
                  <span className="ml-3 font-mono text-xs text-muted truncate">
                    {v.path}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {v.vendor && (
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted capitalize">
                      {v.vendor}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${v.detected ? "bg-accent/20 text-accent" : "bg-surface-3 text-muted"}`}>
                    {v.detected ? "Detected" : "Manual"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Download cards */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
          Download via Adoptium
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {RECOMMENDED.map(({ major, label, desc }) => {
            const alreadyHave = versions.some((v) => v.major === major);
            const progress = installProgress[major];
            const isInstalling = installing === major;

            return (
              <div
                key={major}
                className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-2 p-5"
              >
                <div className="text-4xl">☕</div>
                <div className="text-center">
                  <p className="font-semibold">{label}</p>
                  <p className="mt-0.5 text-xs text-muted">{desc}</p>
                </div>

                {/* Progress bar during install */}
                {isInstalling && progress !== undefined && (
                  <div className="w-full">
                    <div className="flex justify-between mb-1 text-xs text-muted">
                      <span>Downloading…</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {alreadyHave ? (
                  <span className="rounded-full bg-accent/20 px-3 py-1 text-xs text-accent">
                    ✓ Installed
                  </span>
                ) : (
                  <button
                    onClick={() => handleInstall(major)}
                    disabled={isInstalling || !!installing}
                    className="w-full rounded bg-accent py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {isInstalling ? "Queued…" : "Download & Install"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          Full auto-extract and path registration ships in v2.1 — downloads are queued via Adoptium API.
        </p>
      </section>
    </div>
  );
}
