import { useEffect, useState } from "react";

// Read version from package.json at build time via Vite's import.meta
// (Vite exposes define replacements; we fall back to a hardcoded string for web-only dev)
const APP_VERSION = "2.1.0";

function getPlatformLabel(): string {
  if (typeof window !== "undefined" && window.serverlab) {
    const p = window.serverlab.getPlatform();
    const map: Record<string, string> = {
      win32: "Windows",
      darwin: "macOS",
      linux: "Linux",
    };
    return map[p] ?? p;
  }
  return navigator.platform || "Unknown";
}

export function SettingsPage() {
  const [version, setVersion] = useState(APP_VERSION);
  const [platform] = useState(getPlatformLabel);
  const [openingFolder, setOpeningFolder] = useState(false);

  useEffect(() => {
    if (window.serverlab?.getAppVersion) {
      window.serverlab.getAppVersion().then(setVersion).catch(() => {});
    }
  }, []);

  async function handleOpenDataFolder() {
    setOpeningFolder(true);
    try {
      if (window.serverlab?.openPath) {
        // userData path is exposed via a backend endpoint
        const res = await fetch("http://127.0.0.1:3001/health")
          .then(() => fetch("http://127.0.0.1:3001/api/data-path"))
          .catch(() => null);

        const dataPath = res?.ok
          ? ((await res.json()) as { path: string }).path
          : null;

        if (dataPath) {
          await window.serverlab.openPath(dataPath);
        }
      }
    } finally {
      setOpeningFolder(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>

      <div className="flex flex-col gap-4 max-w-lg">
        {/* About */}
        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="mb-4 font-semibold">About</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <Row label="Application" value="ServerLab MC" />
            <Row label="Version" value={`v${version}`} />
            <Row label="Platform" value={platform} />
            <Row label="Engine" value="Electron + React + Node.js" />
          </dl>
        </section>

        {/* Data */}
        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="mb-1 font-semibold">Data</h2>
          <p className="mb-4 text-sm text-muted">
            All server profiles and backups are stored locally. No data leaves your machine.
          </p>
          <button
            onClick={handleOpenDataFolder}
            disabled={openingFolder}
            className="rounded bg-surface-3 px-4 py-2 text-sm font-medium hover:bg-border disabled:opacity-50 transition-colors"
          >
            {openingFolder ? "Opening…" : "Open data folder"}
          </button>
        </section>

        {/* Keyboard shortcuts */}
        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="mb-4 font-semibold">Keyboard shortcuts</h2>
          <div className="flex flex-col gap-2 text-sm">
            <ShortcutRow keys={["Ctrl", "S"]} label="Save file (in editor)" />
            <ShortcutRow keys={["↑", "↓"]} label="Browse command history (console)" />
            <ShortcutRow keys={["Enter"]} label="Send console command" />
          </div>
        </section>

        {/* Roadmap teaser */}
        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="mb-2 font-semibold">Coming next — v3.0</h2>
          <ul className="flex flex-col gap-1.5 text-sm text-muted list-disc list-inside">
            <li>GitHub template browser</li>
            <li>Community template repositories</li>
            <li>One-click server creation from templates</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <div className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded border border-border bg-surface-3 px-1.5 py-0.5 font-mono text-xs"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}
