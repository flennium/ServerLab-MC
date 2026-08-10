import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import clsx from "clsx";
import {
  Archive,
  Clipboard,
  Copy,
  Edit3,
  FileCode2,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../lib/apiClient.js";
import { normalizeError } from "../../lib/errorStore.js";
import { ErrorBanner, InlineError, useError } from "../errors/ErrorProvider.js";
import { Button, IconButton } from "../ui/Button.js";
import { ConfirmModal } from "../ui/ConfirmModal.js";
import { TextInput } from "../ui/Form.js";
import { Alert, Card, EmptyState } from "../ui/Layout.js";
import type {
  AppError,
  FileContentResponse,
  FileEntry,
  FileListResponse,
  FileSearchResponse,
  ServerStatus,
} from "@serverlab/shared";

interface ServerFileWorkspaceProps {
  serverId: string;
  serverPath: string;
  serverStatus: ServerStatus;
}

interface FileTab {
  path: string;
  name: string;
  content: string;
  original: string;
  meta: FileContentResponse | null;
  loading: boolean;
  saving: boolean;
  error: AppError | null;
  saveConflict: boolean;
}

interface WorkspacePrefs {
  openTabs: string[];
  activePath: string | null;
  searchEntireServer?: boolean;
}

type CreateMode = "file" | "folder";

const MAX_RENDERED_ROWS = 650;

export function ServerFileWorkspace({
  serverId,
  serverStatus,
}: ServerFileWorkspaceProps) {
  const storageKey = `serverlab.files.${serverId}`;
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<AppError | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchEntireServer, setSearchEntireServer] = useState(false);
  const [serverSearchResults, setServerSearchResults] = useState<FileEntry[]>([]);
  const [serverSearchLoading, setServerSearchLoading] = useState(false);
  const [serverSearchMeta, setServerSearchMeta] = useState<{ total: number; truncated: boolean } | null>(null);
  const [serverSearchError, setServerSearchError] = useState<AppError | null>(null);
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode | null>(null);
  const [createName, setCreateName] = useState("");
  const [renaming, setRenaming] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<FileEntry | null>(null);
  const [dirtyClosePath, setDirtyClosePath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    entry: FileEntry;
    x: number;
    y: number;
  } | null>(null);
  const restoredPrefs = useRef(false);
  const { reportError } = useError();

  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true);
      setListError(null);
      try {
        const { entries } = await api.get<FileListResponse>(
          `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`
        );
        setEntries(entries);
        setCurrentPath(path);
        setSelectedPath(null);
      } catch (error) {
        const appError = reportError(error, {
          category: "file",
          severity: "error",
          userMessage: "ServerLab could not load this folder.",
          possibleSolution: "Refresh the file list or check that the server folder still exists.",
          source: "renderer:file-workspace",
          action: "load-directory",
        });
        setListError(appError);
      } finally {
        setLoading(false);
      }
    },
    [reportError, serverId]
  );

  useEffect(() => {
    void loadDirectory("");
  }, [loadDirectory]);

  useEffect(() => {
    const prefs: WorkspacePrefs = {
      openTabs: tabs.map((tab) => tab.path),
      activePath,
      searchEntireServer,
    };
    localStorage.setItem(storageKey, JSON.stringify(prefs));
  }, [activePath, searchEntireServer, storageKey, tabs]);

  const openFile = useCallback(async (path: string, name = basename(path), options: { silent?: boolean } = {}) => {
    setActivePath(path);
    setSelectedPath(path);

    const existing = tabs.find((tab) => tab.path === path);
    if (existing) return;

    const loadingTab: FileTab = {
      path,
      name,
      content: "",
      original: "",
      meta: null,
      loading: true,
      saving: false,
      error: null,
      saveConflict: false,
    };
    setTabs((current) => [...current, loadingTab]);

    try {
      const meta = await api.get<FileContentResponse>(
        `/api/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`
      );
      setTabs((current) =>
        current.map((tab) =>
          tab.path === path
            ? {
                ...tab,
                content: meta.content,
                original: meta.content,
                name: basename(path),
                meta,
                loading: false,
                error: null,
                saveConflict: false,
              }
            : tab
        )
      );
    } catch (error) {
      const appError = normalizeError(error, {
        category: "file",
        severity: "error",
        userMessage: "ServerLab could not open this file.",
        possibleSolution: "Check that the file still exists and that ServerLab can read it.",
        source: "renderer:file-workspace",
        action: "open-file",
      });
      if (!options.silent) reportError(appError);
      setTabs((current) =>
        current.map((tab) =>
          tab.path === path ? { ...tab, loading: false, error: appError } : tab
        )
      );
    }
  }, [reportError, serverId, tabs]);

  useEffect(() => {
    if (restoredPrefs.current) return;
    restoredPrefs.current = true;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const prefs = JSON.parse(raw) as WorkspacePrefs;
      setActivePath(typeof prefs.activePath === "string" ? prefs.activePath : null);
      setSearchEntireServer(Boolean(prefs.searchEntireServer));
      for (const path of Array.isArray(prefs.openTabs) ? prefs.openTabs.slice(0, 5) : []) {
        void openFile(path, basename(path), { silent: true });
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [openFile, storageKey]);

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null;
  const isRunning = serverStatus === "running" || serverStatus === "starting";
  const trimmedSearch = searchValue.trim();

  useEffect(() => {
    if (!searchEntireServer || trimmedSearch.length < 2) {
      setServerSearchResults([]);
      setServerSearchMeta(null);
      setServerSearchLoading(false);
      setServerSearchError(null);
      return;
    }

    let cancelled = false;
    setServerSearchLoading(true);
    setServerSearchError(null);
    const handle = window.setTimeout(() => {
      api
        .get<FileSearchResponse>(
          `/api/servers/${serverId}/files/search?query=${encodeURIComponent(trimmedSearch)}&limit=250`
        )
        .then((result) => {
          if (cancelled) return;
          setServerSearchResults(result.entries);
          setServerSearchMeta({ total: result.total, truncated: result.truncated });
        })
        .catch((error) => {
          if (cancelled) return;
          setServerSearchResults([]);
          setServerSearchMeta(null);
          setServerSearchError(
            reportError(error, {
              category: "file",
              severity: "error",
              userMessage: "ServerLab could not search this server.",
              possibleSolution: "Try a narrower search or refresh the server files.",
              source: "renderer:file-workspace",
              action: "search-server-files",
            })
          );
        })
        .finally(() => {
          if (!cancelled) setServerSearchLoading(false);
        });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [reportError, searchEntireServer, serverId, trimmedSearch]);

  const visibleEntries = useMemo(() => {
    if (searchEntireServer && trimmedSearch.length >= 2) return serverSearchResults;
    const needle = trimmedSearch.toLowerCase();
    return entries.filter((entry) => !needle || entry.name.toLowerCase().includes(needle));
  }, [entries, searchEntireServer, serverSearchResults, trimmedSearch]);

  async function saveTab(path: string, force = false) {
    const tab = tabs.find((item) => item.path === path);
    if (!tab || tab.meta?.readonly || tab.content === tab.original) return;

    const validation = validateDraft(tab.path, tab.content);
    if (!force && validation.status === "invalid") {
      setTabs((current) =>
        current.map((item) =>
          item.path === path
            ? {
                ...item,
                error: {
                  id: `validation-${Date.now()}`,
                  category: "file",
                  severity: "warning",
                  userMessage: "This file has a validation issue.",
                  technicalDetails: validation.message ?? "Validation issue",
                  possibleSolution: "Fix the highlighted line or save again with Save anyway.",
                  action: "save-file",
                  source: "renderer:file-workspace",
                  timestamp: new Date().toISOString(),
                  recoveries: ["copy-details", "dismiss"],
                },
              }
            : item
        )
      );
      return;
    }

    setTabs((current) =>
      current.map((item) => (item.path === path ? { ...item, saving: true, error: null } : item))
    );

    try {
      const result = await api.put<{ file: FileContentResponse }>(`/api/servers/${serverId}/files`, {
        path,
        content: tab.content,
        expectedEtag: tab.meta?.etag,
        force,
      });
      const meta = result.file;
      setTabs((current) =>
        current.map((item) =>
          item.path === path
            ? {
                ...item,
                content: meta.content,
                original: meta.content,
                meta,
                saving: false,
                error: null,
                saveConflict: false,
              }
            : item
        )
      );
      await loadDirectory(currentPath);
    } catch (error) {
      const appError = reportError(error, {
        category: "file",
        severity: "error",
        userMessage: "ServerLab could not save this file.",
        possibleSolution: "Check whether the file changed on disk, then retry or save again to overwrite.",
        source: "renderer:file-workspace",
        action: "save-file",
      });
      setTabs((current) =>
        current.map((item) =>
          item.path === path
            ? {
                ...item,
                saving: false,
                error: appError,
                saveConflict: appError.userMessage.toLowerCase().includes("changed on disk"),
              }
            : item
        )
      );
    }
  }

  async function reloadTab(path: string) {
    const scroller = document.querySelector(".cm-scroller") as HTMLElement | null;
    const scrollPosition = scroller
      ? { top: scroller.scrollTop, left: scroller.scrollLeft }
      : null;

    setTabs((current) =>
      current.map((tab) =>
        tab.path === path ? { ...tab, loading: true, error: null, saveConflict: false } : tab
      )
    );

    try {
      const meta = await api.get<FileContentResponse>(
        `/api/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`
      );
      setTabs((current) =>
        current.map((tab) =>
          tab.path === path
            ? {
                ...tab,
                content: meta.content,
                original: meta.content,
                name: basename(path),
                meta,
                loading: false,
                error: null,
                saveConflict: false,
              }
            : tab
        )
      );
      window.requestAnimationFrame(() => {
        if (!scrollPosition) return;
        const nextScroller = document.querySelector(".cm-scroller") as HTMLElement | null;
        if (nextScroller) {
          nextScroller.scrollTop = scrollPosition.top;
          nextScroller.scrollLeft = scrollPosition.left;
        }
      });
    } catch (error) {
      const appError = reportError(error, {
        category: "file",
        severity: "error",
        userMessage: "ServerLab could not reload this file.",
        possibleSolution: "Check that the file still exists, then refresh the folder.",
        source: "renderer:file-workspace",
        action: "reload-file",
      });
      setTabs((current) =>
        current.map((tab) =>
          tab.path === path ? { ...tab, loading: false, error: appError } : tab
        )
      );
    }
  }

  function closeTab(path: string, force = false) {
    const tab = tabs.find((item) => item.path === path);
    if (tab && !force && tab.content !== tab.original) {
      setDirtyClosePath(path);
      return;
    }
    const nextTabs = tabs.filter((item) => item.path !== path);
    setTabs(nextTabs);
    if (activePath === path) setActivePath(nextTabs.at(-1)?.path ?? null);
    setDirtyClosePath(null);
  }

  async function createEntry() {
    if (!createMode || !createName.trim()) return;
    const target = joinPath(currentPath, createName.trim());
    try {
      if (createMode === "folder") {
        await api.post(`/api/servers/${serverId}/files/folders`, { path: target });
      } else {
        await api.post(`/api/servers/${serverId}/files/create`, { path: target, content: "" });
        await openFile(target, basename(target));
      }
      setCreateMode(null);
      setCreateName("");
      await loadDirectory(currentPath);
    } catch (error) {
      setListError(
        reportError(error, {
          category: "file",
          severity: "error",
          userMessage: `ServerLab could not create this ${createMode}.`,
          possibleSolution: "Use a valid name and check that the folder is writable.",
          source: "renderer:file-workspace",
          action: `create-${createMode}`,
        })
      );
    }
  }

  async function renameEntry() {
    if (!renaming || !renameValue.trim()) return;
    const target = joinPath(dirname(renaming.path), renameValue.trim());
    try {
      await api.patch(`/api/servers/${serverId}/files/rename`, {
        oldPath: renaming.path,
        newPath: target,
      });
      setTabs((current) =>
        current.map((tab) =>
          tab.path === renaming.path
            ? { ...tab, path: target, name: basename(target), meta: tab.meta ? { ...tab.meta, path: target } : null }
            : tab
        )
      );
      if (activePath === renaming.path) setActivePath(target);
      setRenaming(null);
      setRenameValue("");
      await loadDirectory(currentPath);
    } catch (error) {
      setListError(
        reportError(error, {
          category: "file",
          severity: "error",
          userMessage: "ServerLab could not rename this item.",
          possibleSolution: "Check the name and make sure a file with that name does not already exist.",
          source: "renderer:file-workspace",
          action: "rename-file",
        })
      );
    }
  }

  async function deleteEntry(entry: FileEntry) {
    try {
      await api.delete(`/api/servers/${serverId}/files?path=${encodeURIComponent(entry.path)}`);
      setTabs((current) => current.filter((tab) => !tab.path.startsWith(entry.path)));
      if (activePath?.startsWith(entry.path)) setActivePath(null);
      setPendingDelete(null);
      await loadDirectory(currentPath);
    } catch (error) {
      setListError(
        reportError(error, {
          category: "file",
          severity: "error",
          userMessage: "ServerLab could not delete this item.",
          possibleSolution: "Check folder permissions or stop the server if it is using the file.",
          source: "renderer:file-workspace",
          action: "delete-file",
        })
      );
    }
  }

  async function duplicateEntry(entry: FileEntry) {
    try {
      await api.post(`/api/servers/${serverId}/files/duplicate`, { path: entry.path });
      await loadDirectory(currentPath);
    } catch (error) {
      setListError(
        reportError(error, {
          category: "file",
          severity: "error",
          userMessage: "ServerLab could not duplicate this item.",
          possibleSolution: "Check available disk space and folder permissions.",
          source: "renderer:file-workspace",
          action: "duplicate-file",
        })
      );
    }
  }

  async function copyPath(path: string) {
    await navigator.clipboard?.writeText(path).catch(() => {});
  }

  function openEntry(entry: FileEntry) {
    if (entry.isDirectory) void loadDirectory(entry.path);
    else void openFile(entry.path, entry.name);
  }

  function openContextMenu(entry: FileEntry, event: MouseEvent) {
    event.preventDefault();
    setSelectedPath(entry.path);
    setContextMenu({
      entry,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 250)),
    });
  }

  useEffect(() => {
    if (!contextMenu) return;
    function closeMenu() {
      setContextMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setContextMenu(null);
    }
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    function onWorkspaceKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        setCreateMode("file");
        setCreateName("");
      } else if (key === "f") {
        event.preventDefault();
        setSearchEntireServer(true);
      }
    }
    window.addEventListener("keydown", onWorkspaceKeyDown);
    return () => window.removeEventListener("keydown", onWorkspaceKeyDown);
  }, []);

  const dirtyCount = tabs.filter((tab) => tab.content !== tab.original).length;
  const rows = visibleEntries.slice(0, MAX_RENDERED_ROWS);

  return (
    <div className="grid min-h-[620px] gap-4 xl:grid-cols-[minmax(300px,0.54fr)_minmax(560px,1.46fr)]">
      <Card className="flex min-h-[520px] flex-col overflow-hidden">
        <div className="border-b border-border bg-carbon px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="font-display text-sm font-semibold text-white">Server files</p>
              <p className="mt-0.5 text-xs text-muted">
                {searchEntireServer && trimmedSearch.length >= 2
                  ? `${serverSearchMeta?.total ?? serverSearchResults.length} server result${(serverSearchMeta?.total ?? serverSearchResults.length) === 1 ? "" : "s"}`
                  : `${entries.length} item${entries.length === 1 ? "" : "s"} in this folder`}
              </p>
            </div>
            <div className="flex gap-1">
              <IconButton icon={FilePlus2} label="Create file" onClick={() => setCreateMode("file")} />
              <IconButton icon={FolderPlus} label="Create folder" onClick={() => setCreateMode("folder")} />
              <IconButton icon={RefreshCw} label="Refresh files" onClick={() => loadDirectory(currentPath)} />
            </div>
          </div>

          <div className="grid gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <TextInput
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={searchEntireServer ? "Search server files" : "Search this folder"}
                className="h-9 pl-9 pr-20 text-xs"
              />
              {serverSearchLoading && (
                <RefreshCw className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-copper" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setSearchEntireServer((value) => !value)}
              className={clsx(
                "flex h-8 items-center justify-between rounded border px-2.5 text-xs font-semibold transition-colors",
                searchEntireServer
                  ? "border-copper/60 bg-copper/15 text-copper"
                  : "border-border bg-rail text-muted hover:text-white"
              )}
            >
              <span>Search entire server</span>
              <span
                className={clsx(
                  "h-4 w-7 rounded-full border p-0.5 transition-colors",
                  searchEntireServer ? "border-copper bg-copper/25" : "border-border bg-carbon"
                )}
              >
                <span
                  className={clsx(
                    "block h-2.5 w-2.5 rounded-full bg-current transition-transform",
                    searchEntireServer && "translate-x-3"
                  )}
                />
              </span>
            </button>
          </div>
        </div>

        <div className="border-b border-border px-3 py-2">
          <Breadcrumbs currentPath={currentPath} onOpen={loadDirectory} />
        </div>

        {createMode && (
          <div className="border-b border-border bg-surface-console px-3 py-3">
            <div className="flex gap-2">
              <TextInput
                autoFocus
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createEntry();
                  if (event.key === "Escape") setCreateMode(null);
                }}
                placeholder={createMode === "file" ? "config.yml" : "plugins"}
                className="h-8 py-1 text-xs"
              />
              <Button onClick={createEntry} variant="primary" size="sm">
                Create
              </Button>
              <IconButton icon={X} label="Cancel" onClick={() => setCreateMode(null)} />
            </div>
          </div>
        )}

        {listError && <div className="p-3"><InlineError error={listError} /></div>}
        {serverSearchError && <div className="p-3"><InlineError error={serverSearchError} /></div>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {(loading || serverSearchLoading) && (
            <div className="grid gap-1 p-2">
              {[1, 2, 3, 4, 5, 6].map((index) => (
                <div key={index} className="h-10 animate-pulse rounded bg-rail" />
              ))}
            </div>
          )}

          {!loading && !serverSearchLoading && rows.length === 0 && !listError && !serverSearchError && (
            <div className="px-4 py-10 text-center">
              <FolderOpen className="mx-auto mb-3 h-8 w-8 text-muted" />
              <p className="font-semibold text-white">
                {trimmedSearch ? "No matching files" : "This folder is empty"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {trimmedSearch
                  ? searchEntireServer
                    ? "Try a shorter filename or search the current folder."
                    : "Try searching the entire server."
                  : "Create a file or folder from the toolbar above."}
              </p>
            </div>
          )}

          {!loading && !serverSearchLoading &&
            rows.map((entry) => (
              <FileTreeRow
                key={entry.path}
                entry={entry}
                showPath={searchEntireServer && trimmedSearch.length >= 2}
                selected={selectedPath === entry.path || activePath === entry.path}
                renaming={renaming?.path === entry.path}
                renameValue={renameValue}
                onRenameValue={setRenameValue}
                onConfirmRename={renameEntry}
                onCancelRename={() => setRenaming(null)}
                onSelect={() => setSelectedPath(entry.path)}
                onOpen={() => openEntry(entry)}
                onContextMenu={(event) => openContextMenu(entry, event)}
              />
            ))}

          {!loading && !serverSearchLoading && searchEntireServer && serverSearchMeta?.truncated && (
            <p className="border-t border-border px-3 py-2 text-xs text-muted">
              Showing the first {rows.length} matches. Narrow the search to see more.
            </p>
          )}

          {!loading && !serverSearchLoading && !searchEntireServer && visibleEntries.length > MAX_RENDERED_ROWS && (
            <p className="border-t border-border px-3 py-2 text-xs text-muted">
              Showing first {MAX_RENDERED_ROWS} items. Search to narrow this folder.
            </p>
          )}
        </div>
      </Card>

      <Card className="flex min-h-[520px] flex-col overflow-hidden">
        <div className="flex min-h-[44px] items-center justify-between gap-2 border-b border-border bg-carbon px-3">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {tabs.length === 0 ? (
              <span className="text-xs text-muted">No open files</span>
            ) : (
              tabs.map((tab) => (
                <button
                  key={tab.path}
                  type="button"
                  onClick={() => setActivePath(tab.path)}
                  className={clsx(
                    "flex max-w-[220px] shrink-0 items-center gap-2 rounded border px-2 py-1.5 text-xs transition-colors",
                    activePath === tab.path
                      ? "border-copper/60 bg-copper/10 text-white"
                      : "border-border bg-rail text-muted hover:text-white"
                  )}
                >
                  <FileGlyph type={tab.meta?.language ?? languageForName(tab.name)} />
                  <span className="truncate font-mono">{tab.name}</span>
                  {tab.content !== tab.original && <span className="h-1.5 w-1.5 rounded-full bg-glowstone" />}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Close ${tab.name}`}
                    className="rounded p-0.5 hover:bg-panel"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.path);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.stopPropagation();
                        closeTab(tab.path);
                      }
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              onClick={() => Promise.all(tabs.map((tab) => saveTab(tab.path))).then(() => undefined)}
              icon={Save}
              variant="secondary"
              size="sm"
              disabled={dirtyCount === 0}
            >
              Save all
            </Button>
          </div>
        </div>

        <EditorPane
          tab={activeTab}
          isRunning={isRunning}
          onChange={(value) =>
            activeTab &&
            setTabs((current) =>
              current.map((tab) => (tab.path === activeTab.path ? { ...tab, content: value } : tab))
            )
          }
          onSave={(force) => activeTab && saveTab(activeTab.path, force)}
          onReload={() => activeTab && reloadTab(activeTab.path)}
          onClose={() => activeTab && closeTab(activeTab.path)}
        />
      </Card>

      {contextMenu && (
        <FileContextMenu
          entry={contextMenu.entry}
          x={contextMenu.x}
          y={contextMenu.y}
          onOpen={() => openEntry(contextMenu.entry)}
          onCopyPath={() => copyPath(contextMenu.entry.path)}
          onDuplicate={() => duplicateEntry(contextMenu.entry)}
          onRename={() => {
            setRenaming(contextMenu.entry);
            setRenameValue(contextMenu.entry.name);
          }}
          onDelete={() => setPendingDelete(contextMenu.entry)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={`Delete "${pendingDelete.name}"?`}
          message={
            pendingDelete.isDirectory
              ? "This will permanently delete the folder and everything inside it."
              : "This file will be permanently deleted."
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteEntry(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {dirtyClosePath && (
        <ConfirmModal
          title="Close unsaved file?"
          message="This file has unsaved changes. Save it before closing or discard the draft."
          confirmLabel="Discard"
          danger
          onConfirm={() => closeTab(dirtyClosePath, true)}
          onCancel={() => setDirtyClosePath(null)}
        />
      )}
    </div>
  );
}

function EditorPane({
  tab,
  isRunning,
  onChange,
  onSave,
  onReload,
  onClose,
}: {
  tab: FileTab | null;
  isRunning: boolean;
  onChange: (value: string) => void;
  onSave: (force?: boolean) => void;
  onReload: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave]);

  if (!tab) {
    return (
      <EmptyState
        icon={<FileCode2 className="h-10 w-10" aria-hidden="true" />}
        title="Choose a server file"
        description="Open a config, plugin file, or log from the explorer. Tabs stay available while you move around this server."
      />
    );
  }

  const dirty = tab.content !== tab.original;
  const draftValidation = validateDraft(tab.path, tab.content);
  const validation = dirty ? draftValidation : tab.meta?.validation;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-white">{tab.path}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase text-muted">
            <span>{tab.meta?.language ?? languageForName(tab.name)}</span>
            {tab.meta?.readonly && <span className="text-glowstone">Read only</span>}
            {tab.meta?.isTruncated && <span className="text-glowstone">Preview</span>}
            {dirty && <span className="text-glowstone">Unsaved</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button onClick={() => onSave()} disabled={!dirty || tab.saving || tab.meta?.readonly} icon={Save} variant="primary" size="sm">
            {tab.saving ? "Saving..." : "Save"}
          </Button>
          <IconButton icon={RotateCcw} label="Reload file" onClick={onReload} disabled={tab.loading} />
          <IconButton icon={X} label="Close file" onClick={onClose} />
        </div>
      </div>

      {isRunning && tab.meta?.restartHint && (
        <Alert tone="warning" className="m-3 mb-0">
          <span>{tab.meta.restartHint}</span>
        </Alert>
      )}

      {tab.error && (
        <div className="m-3 mb-0">
          <ErrorBanner error={tab.error} />
          {tab.saveConflict && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button onClick={onReload} icon={RefreshCw} variant="secondary" size="sm">
                Reload disk version
              </Button>
              <Button onClick={() => onSave(true)} icon={ShieldAlert} variant="danger" size="sm">
                Overwrite anyway
              </Button>
            </div>
          )}
        </div>
      )}

      {validation?.message && (validation.status === "invalid" || validation.status === "warning") && (
        <Alert tone={validation.status === "invalid" ? "danger" : "warning"} className="m-3 mb-0">
          <span>
            {validation.line ? `Line ${validation.line}: ` : ""}
            {validation.message}
          </span>
        </Alert>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab.loading && <p className="px-4 py-8 text-center text-sm text-muted">Loading file...</p>}
        {!tab.loading && tab.meta?.encoding === "binary" && (
          <EmptyState
            icon={<Archive className="h-10 w-10" aria-hidden="true" />}
            title="Binary file"
            description="This file is not safe to open as text. Export it from the file actions instead."
          />
        )}
        {!tab.loading && tab.meta?.encoding !== "binary" && (
          <CodeMirror
            value={tab.content}
            height="100%"
            minHeight="470px"
            theme={oneDark}
            editable={!tab.meta?.readonly}
            extensions={extensionsFor(tab.name)}
            onChange={onChange}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              searchKeymap: true,
            }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-carbon px-3 py-2 font-mono text-xs text-muted">
        <span>{tab.meta ? formatBytes(tab.meta.sizeBytes) : "Loading"} {tab.meta?.isTruncated && `, previewing ${formatBytes(tab.meta.previewBytes ?? 0)}`}</span>
        <span>{tab.meta?.modifiedAt ? `Modified ${formatDate(tab.meta.modifiedAt)}` : "No metadata"}</span>
      </div>
    </div>
  );
}

function FileContextMenu({
  entry,
  x,
  y,
  onOpen,
  onRename,
  onDuplicate,
  onCopyPath,
  onDelete,
}: {
  entry: FileEntry;
  x: number;
  y: number;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onCopyPath: () => void;
  onDelete: () => void;
}) {
  const items = [
    { label: entry.isDirectory ? "Open folder" : "Open file", icon: entry.isDirectory ? FolderOpen : Edit3, action: onOpen },
    { label: "Rename", icon: FileText, action: onRename },
    { label: "Duplicate", icon: Copy, action: onDuplicate },
    { label: "Copy relative path", icon: Clipboard, action: onCopyPath },
    { label: "Delete", icon: Trash2, action: onDelete, danger: true },
  ];

  return (
    <div
      className="fixed z-50 w-56 overflow-hidden rounded-md border border-border bg-carbon py-1 shadow-2xl"
      style={{ left: x, top: y }}
      role="menu"
    >
      <div className="border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
        <FileGlyph type={entry.type} directory={entry.isDirectory} />
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold text-white">{entry.name}</p>
          <p className="truncate text-[0.68rem] text-muted">
            {entry.isDirectory ? "Folder" : `${labelForType(entry.type)}${entry.sizeBytes != null ? `, ${formatBytes(entry.sizeBytes)}` : ""}`}
          </p>
        </div>
        </div>
      </div>
      {items.map(({ label, icon: Icon, action, danger }) => (
        <button
          key={label}
          type="button"
          onClick={action}
          className={clsx(
            "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-rail",
            danger ? "text-redstone" : "text-muted hover:text-white"
          )}
          role="menuitem"
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

function FileTreeRow({
  entry,
  showPath,
  selected,
  renaming,
  renameValue,
  onRenameValue,
  onConfirmRename,
  onCancelRename,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  entry: FileEntry;
  showPath?: boolean;
  selected: boolean;
  renaming: boolean;
  renameValue: string;
  onRenameValue: (value: string) => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu: (event: MouseEvent) => void;
}) {
  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
      className={clsx(
        "cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-rail",
        selected && "bg-rail"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <FileGlyph type={entry.type} directory={entry.isDirectory} />
        {renaming ? (
          <TextInput
            autoFocus
            value={renameValue}
            onChange={(event) => onRenameValue(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onBlur={onCancelRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") onConfirmRename();
              if (event.key === "Escape") onCancelRename();
            }}
            className="h-7 py-1 font-mono text-xs"
          />
        ) : (
          <div className="min-w-0">
            <p className="truncate font-mono text-xs text-white">{entry.name}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[0.68rem] text-muted">
              <span className="truncate">
                {showPath ? dirname(entry.path) || "root" : entry.isDirectory ? "Folder" : labelForType(entry.type)}
              </span>
              {!entry.isDirectory && entry.sizeBytes != null && <span>{formatBytes(entry.sizeBytes)}</span>}
              {entry.readonly && <span className="text-glowstone">Read only</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Breadcrumbs({
  currentPath,
  onOpen,
}: {
  currentPath: string;
  onOpen: (path: string) => void;
}) {
  const parts = currentPath.split("/").filter(Boolean);
  const crumbs = [
    { label: "root", path: "" },
    ...parts.map((part, index) => ({
      label: part,
      path: parts.slice(0, index + 1).join("/"),
    })),
  ];
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-xs text-muted">
      {crumbs.map((crumb) => (
        <button
          key={crumb.path || "root"}
          type="button"
          onClick={() => onOpen(crumb.path)}
          className={clsx(
            "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-rail hover:text-white",
            crumb.path === currentPath && "text-white"
          )}
        >
          {crumb.path === "" && <Home className="h-3.5 w-3.5" />}
          {crumb.label}
        </button>
      ))}
    </div>
  );
}

function FileGlyph({
  type,
  directory,
}: {
  type: FileEntry["type"] | FileContentResponse["language"];
  directory?: boolean;
}) {
  if (directory || type === "directory") return <Folder className="h-4 w-4 shrink-0 text-copper" />;
  if (type === "archive" || type === "binary") return <Archive className="h-4 w-4 shrink-0 text-muted" />;
  if (["json", "yaml", "properties", "config", "javascript", "toml"].includes(type)) {
    return <FileCode2 className="h-4 w-4 shrink-0 text-lapis" />;
  }
  if (type === "log") return <FileText className="h-4 w-4 shrink-0 text-glowstone" />;
  return <FileText className="h-4 w-4 shrink-0 text-muted" />;
}

function extensionsFor(fileName: string) {
  const language = languageForName(fileName);
  if (language === "yaml") return [yaml()];
  if (language === "json") return [json()];
  if (language === "javascript") return [javascript()];
  return [];
}

function validateDraft(path: string, content: string): FileContentResponse["validation"] {
  const language = languageForName(path);
  if (language === "json") {
    try {
      JSON.parse(content || "{}");
      return { status: "valid", message: null };
    } catch (error) {
      return { status: "invalid", message: error instanceof Error ? error.message : "Invalid JSON" };
    }
  }
  if (language === "properties") {
    const seen = new Set<string>();
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line || line.startsWith("#") || line.startsWith("!")) continue;
      const separatorIndex = line.search(/[:=]/);
      if (separatorIndex <= 0) {
        return { status: "invalid", line: index + 1, message: "Use key=value or key:value." };
      }
      const key = line.slice(0, separatorIndex).trim();
      if (seen.has(key)) {
        return { status: "warning", line: index + 1, message: `Duplicate property "${key}".` };
      }
      seen.add(key);
    }
    return { status: "valid", message: null };
  }
  if (language === "yaml") {
    const tabLine = content.split(/\r?\n/).findIndex((line) => /^\t+/.test(line));
    if (tabLine >= 0) {
      return { status: "warning", line: tabLine + 1, message: "YAML indentation should use spaces." };
    }
    return { status: "unknown", message: "YAML is highlighted. Validate plugin configs carefully." };
  }
  return { status: "unknown", message: null };
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function dirname(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function joinPath(base: string, name: string): string {
  const cleanName = name.replace(/^[/\\]+/, "");
  return base ? `${base}/${cleanName}` : cleanName;
}

function languageForName(name: string): FileContentResponse["language"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".properties")) return "properties";
  if (lower.endsWith(".js") || lower.endsWith(".ts") || lower.endsWith(".mjs")) return "javascript";
  if (lower.endsWith(".log")) return "log";
  if (lower.endsWith(".toml")) return "toml";
  if (/\.(txt|conf|ini|cfg|md)$/.test(lower)) return "text";
  return "unknown";
}

function labelForType(type: FileEntry["type"]): string {
  const labels: Record<FileEntry["type"], string> = {
    directory: "Folder",
    config: "Config",
    json: "JSON",
    yaml: "YAML",
    properties: "Properties",
    log: "Log",
    text: "Text",
    archive: "Archive",
    binary: "Binary",
    other: "File",
  };
  return labels[type];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
