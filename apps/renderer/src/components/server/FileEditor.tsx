import { useState, useEffect, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { Save, X } from "lucide-react";
import { api } from "../../lib/apiClient.js";
import { Alert } from "../ui/Layout.js";
import { Button, IconButton } from "../ui/Button.js";
import { reportError } from "../../lib/errorStore.js";
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
    case "mjs":
    case "cjs":
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
    setError(null);
    api
      .get<FileContentResponse>(
        `/api/servers/${serverId}/files/content?path=${encodeURIComponent(filePath)}`
      )
      .then(({ content }) => {
        setContent(content);
        setOriginal(content);
      })
      .catch((error) =>
        setError(reportError(error, {
          category: "file",
          userMessage: "The file could not be opened.",
          possibleSolution: "Refresh the file list or check its permissions.",
          source: "renderer:file-editor",
          action: "open-file",
        }).userMessage)
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
    } catch (error) {
      setError(reportError(error, {
        category: "file",
        userMessage: "The file could not be saved.",
        possibleSolution: "Check permissions and whether the file changed on disk.",
        source: "renderer:file-editor",
        action: "save-file",
      }).userMessage);
    } finally {
      setSaving(false);
    }
  }, [content, serverId, filePath]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  return (
    <div className="flex min-h-[460px] flex-col overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex items-center gap-3 border-b border-border bg-carbon px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-white">{filePath}</p>
          <p className="mt-0.5 text-xs text-muted">{fileName}</p>
        </div>
        {isDirty && <span className="shrink-0 text-xs font-semibold text-glowstone">Unsaved</span>}
        {saved && <span className="shrink-0 text-xs font-semibold text-grass">Saved</span>}
        <Button onClick={handleSave} disabled={saving || !isDirty} icon={Save} variant="primary" size="sm">
          {saving ? "Saving..." : "Save"}
        </Button>
        <IconButton icon={X} label="Close editor" onClick={onClose} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {loading && <p className="px-4 py-8 text-center text-sm text-muted">Loading file...</p>}
        {error && <Alert tone="danger" className="m-3">{error}</Alert>}
        {!loading && content !== null && (
          <CodeMirror
            value={content}
            height="100%"
            minHeight="420px"
            theme={oneDark}
            extensions={getExtensions(fileName)}
            onChange={(value) => setContent(value)}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              searchKeymap: true,
            }}
          />
        )}
      </div>

      <div className="border-t border-border bg-carbon px-3 py-2 font-mono text-xs text-muted">
        Ctrl+S saves this file
      </div>
    </div>
  );
}
