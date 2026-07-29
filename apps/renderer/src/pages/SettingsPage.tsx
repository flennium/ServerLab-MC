export function SettingsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>

      <div className="flex flex-col gap-4 max-w-lg">
        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="mb-4 font-semibold">About</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Application</dt>
              <dd>ServerLab MC</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Version</dt>
              <dd>1.0.0</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Platform</dt>
              <dd>Windows</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="mb-1 font-semibold">Data</h2>
          <p className="mb-4 text-sm text-muted">
            All server data is stored locally in a SQLite database.
          </p>
          <button
            className="rounded bg-surface-3 px-4 py-2 text-sm font-medium hover:bg-border transition-colors"
            disabled
          >
            Open data folder
          </button>
        </section>
      </div>
    </div>
  );
}
