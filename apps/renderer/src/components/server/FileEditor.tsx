import { useState, useEffect, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { api } from "../../lib/apiClient.js";
import type { FileContentResponse } from "@serverlab/shared";

interface FileEditorProps {
  serverId: string;
  filePath: string;
  fileName: string;
  onClose: () => void;
}

function getExtensions(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "yml":
    case "yaml":
      return [yaml()];
    case "json":
      return [json()];
    case "js":
    case "ts":
      return [javascript()];
    default:
      return [];
  }
}

export function FileEditor({ serverId, filePath, fileName, onClose }: FileEditorProps) {
  const [content, setContent] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .get<FileContentResponse>(
        `/api/servers/${serverId}/files/content?path=${encodeURIComponent(filePath)}`
      )
      .then(({ content }) => {
        setContent(content);
        setOriginal(content);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load file")
      )
      .finally(() => setLoading(false));
  }, [serverId, filePath]);

  const isDirty = content !== original;

  const handleSave = useCallback(async () => {
    if (content === null) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/servers/${serverId}/files`, {
        path: filePath,
        content,
      });
      setOriginal(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [content, serverId, filePath]);

  // Ctrl+S to save
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  return (
    <div className="flex flex-col rounded-lg border border-border overflow-hidden bg-[#0a0a0a]">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b border-border px-3 py-2">
        <span className="font-mono text-xs text-muted truncate flex-1">
          {filePath}
        </span>
        {isDirty && (
          <span className="text-xs text-warning shrink-0">● unsaved</span>
        )}
        {saved && (
          <span className="text-xs text-accent shrink-0">✓ saved</span>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40 transition-colors shrink-0"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onClose}
          className="text-muted hover:text-white transition-colors text-sm shrink-0"
          aria-label="Close editor"
        >
          ✕
        </button>
      </div>

      {/* Editor */}
      <div className="overflow-hidden">
        {loading && (
          <p className="px-4 py-6 text-xs text-muted text-center">Loading…</p>
        )}
        {error && (
          <p className="px-4 py-3 text-xs text-danger">{error}</p>
        )}
        {!loading && content !== null && (
          <CodeMirror
            value={content}
            height="400px"
            theme={oneDark}
            extensions={getExtensions(fileName)}
            onChange={(val) => setContent(val)}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              searchKeymap: true,
            }}
          />
        )}
      </div>

      {/* Footer hint */}
      <div className="border-t border-border px-3 py-1.5 text-xs text-muted">
        Ctrl+S to save · {fileName}
      </div>
    </div>
  );
}
