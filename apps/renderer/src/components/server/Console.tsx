import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { MutableRefObject, ReactNode } from "react";
import clsx from "clsx";
import {
  ArrowDownCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Pause,
  Play,
  Search,
  Send,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { getSocket } from "../../lib/socket.js";
import { api } from "../../lib/apiClient.js";
import { formatConsoleLine } from "../../lib/consoleFormat.js";
import { useConsoleStore } from "../../store/consoleStore.js";
import { Button, IconButton } from "../ui/Button.js";
import { Alert } from "../ui/Layout.js";
import type { ServerStatus } from "@serverlab/shared";

interface ConsoleProps {
  serverId: string;
  serverStatus?: ServerStatus;
}

const EMPTY_LINES: ReturnType<typeof useConsoleStore.getState>["linesByServer"][string] =
  [];
const MAX_RENDERED_LINES = 1000;

export function Console({ serverId, serverStatus }: ConsoleProps) {
  const lines = useConsoleStore((state) => state.linesByServer[serverId] ?? EMPTY_LINES);
  const paused = useConsoleStore((state) => state.pausedByServer[serverId] ?? false);
  const clearLines = useConsoleStore((state) => state.clearLines);
  const setPaused = useConsoleStore((state) => state.setPaused);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sending, setSending] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const matchRefs = useRef(new Map<string, HTMLSpanElement>());
  const canSendCommands = serverStatus === undefined || serverStatus === "running";

  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const matches: { lineIndex: number; start: number; end: number }[] = [];
    lines.forEach((line, lineIndex) => {
      const text = line.text.toLowerCase();
      let fromIndex = 0;
      while (fromIndex < text.length) {
        const start = text.indexOf(query, fromIndex);
        if (start === -1) break;
        matches.push({ lineIndex, start, end: start + query.length });
        fromIndex = Math.max(start + query.length, start + 1);
      }
    });
    return matches;
  }, [lines, searchQuery]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!searchOpen) return;
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchMatches.length) return;
    const match = searchMatches[activeMatchIndex % searchMatches.length];
    const node = matchRefs.current.get(matchKey(match.lineIndex, match.start));
    node?.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [activeMatchIndex, searchMatches]);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  }, [lines, autoScroll]);

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    }

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [searchOpen]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }

  const sendCommand = useCallback(async () => {
    const command = input.trim();
    if (!command || sending) return;
    if (!canSendCommands) {
      setCommandError("Start the server before sending console commands.");
      return;
    }
    setHistory((previous) => [command, ...previous.slice(0, 49)]);
    setHistoryIdx(-1);
    setInput("");
    setSending(true);
    setCommandError(null);
    try {
      const socket = await getSocket();
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Console command timed out")),
          4000
        );
        socket.emit("console:command", { serverId, command }, (result) => {
          window.clearTimeout(timeout);
          if (!result.ok) {
            reject(new Error(result.error ?? "Command failed"));
            return;
          }
          resolve();
        });
      });
    } catch (error) {
      try {
        await api.post(`/api/servers/${serverId}/command`, { command });
      } catch (fallbackError) {
        setCommandError(
          fallbackError instanceof Error
            ? fallbackError.message
            : error instanceof Error
              ? error.message
              : "Command failed"
        );
      }
    } finally {
      setSending(false);
    }
  }, [canSendCommands, input, sending, serverId]);

  function togglePaused() {
    setPaused(serverId, !paused);
  }

  async function copyConsole() {
    const text = lines
      .map((line) => `[${new Date(line.timestamp).toLocaleTimeString()}] ${line.text}`)
      .join("\n");
    await navigator.clipboard?.writeText(text);
  }

  function goToNextMatch(direction: 1 | -1) {
    if (!searchMatches.length) return;
    setActiveMatchIndex((current) =>
      (current + direction + searchMatches.length) % searchMatches.length
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      sendCommand();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setInput(history[idx] ?? "");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setInput(idx === -1 ? "" : (history[idx] ?? ""));
    }
  }

  const activeSearchMatch =
    searchMatches.length > 0
      ? searchMatches[activeMatchIndex % searchMatches.length]
      : null;
  const activeSearchLabel =
    searchQuery.trim() && searchMatches.length > 0
      ? `${(activeMatchIndex % searchMatches.length) + 1}/${searchMatches.length}`
      : searchQuery.trim()
        ? "0/0"
        : "-";

  return (
    <div className="flex h-[calc(100vh-17rem)] min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-surface-console shadow-2xl">
      <div className="border-b border-border bg-carbon">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded border border-copper/40 bg-copper/10">
              <Terminal className="h-4 w-4 text-copper" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-white">Console</p>
              <p className="truncate font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted">
                {lines.length === MAX_RENDERED_LINES ? `last ${MAX_RENDERED_LINES} lines` : `${lines.length} lines`} {paused ? "/ paused" : "/ live"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!autoScroll && (
              <Button
                onClick={() => {
                  setAutoScroll(true);
                  bottomRef.current?.scrollIntoView({
                    behavior: prefersReducedMotion() ? "auto" : "smooth",
                  });
                }}
                icon={ArrowDownCircle}
                variant="quiet"
                size="sm"
              >
                Resume
              </Button>
            )}
            <IconButton
              icon={Search}
              label="Search console"
              onClick={() => setSearchOpen((value) => !value)}
            />
            <IconButton
              icon={paused ? Play : Pause}
              label={paused ? "Resume console output" : "Pause console output"}
              onClick={togglePaused}
            />
            <IconButton
              icon={Copy}
              label="Copy console"
              onClick={copyConsole}
              disabled={lines.length === 0}
            />
            <IconButton
              icon={Trash2}
              label="Clear console"
              onClick={() => clearLines(serverId)}
            />
          </div>
        </div>

        {searchOpen && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border bg-panel/70 px-3 py-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    goToNextMatch(event.shiftKey ? -1 : 1);
                  }
                  if (event.key === "Escape") {
                    setSearchOpen(false);
                    setSearchQuery("");
                  }
                }}
                placeholder="Search console output"
                className="console-font h-9 w-full rounded border border-border bg-carbon pl-9 pr-3 text-sm text-white placeholder:text-muted focus:border-copper focus:outline-none"
                aria-label="Search console output"
                spellCheck={false}
              />
            </div>
            <span className="min-w-[4.5rem] text-right font-mono text-xs text-muted">
              {activeSearchLabel}
            </span>
            <IconButton icon={ChevronUp} label="Previous match" onClick={() => goToNextMatch(-1)} disabled={searchMatches.length === 0} />
            <IconButton icon={ChevronDown} label="Next match" onClick={() => goToNextMatch(1)} disabled={searchMatches.length === 0} />
            <IconButton
              icon={X}
              label="Close search"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
            />
          </div>
        )}
      </div>

      {!canSendCommands && (
        <Alert tone="warning" placement="inline" className="m-3 mb-0">
          Console commands are disabled while this server is {serverStatus}.
        </Alert>
      )}

      {commandError && (
        <Alert
          tone="danger"
          className="m-3 mb-0"
          autoDismissMs={7000}
          dismissKey={commandError}
          onDismiss={() => setCommandError(null)}
        >
          {commandError}
        </Alert>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="console-font min-h-0 flex-1 overflow-y-auto px-4 py-3 text-[13px]"
        role="log"
        aria-live="polite"
        aria-label="Server console output"
      >
        {lines.length === 0 && (
          <p className="text-xs text-muted">
            Console output appears here after the server starts.
          </p>
        )}
        {lines.map((line, index) => (
          <div
            key={`${line.timestamp}-${index}`}
            className={clsx(
              "grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 whitespace-pre-wrap break-words rounded px-1 py-0.5 leading-relaxed",
              lineTone(line.text)
            )}
          >
            <span className="mr-3 select-none text-muted/60">
              {new Date(line.timestamp).toLocaleTimeString()}
            </span>
            <span>
              <ConsoleLineText
                lineIndex={index}
                text={line.text}
                searchQuery={searchQuery}
                activeMatch={activeSearchMatch}
                matchRefs={matchRefs}
              />
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex border-t border-border bg-carbon">
        <span className="flex items-center px-3 font-mono text-copper" aria-hidden="true">
          &gt;
        </span>
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending || !canSendCommands}
          placeholder={
            canSendCommands
              ? "Type a command and press Enter"
              : "Start the server to send commands"
          }
          className="console-font min-w-0 flex-1 bg-transparent py-3 pr-3 text-white placeholder:text-muted focus:outline-none"
          aria-label="Console command input"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          onClick={sendCommand}
          disabled={sending || !input.trim() || !canSendCommands}
          className="inline-flex items-center gap-2 border-l border-border px-4 text-xs font-semibold text-muted transition-colors hover:bg-rail hover:text-white"
          aria-label="Send command"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {sending ? "Sending" : "Send"}
        </button>
      </div>
    </div>
  );
}

function ConsoleLineText({
  lineIndex,
  text,
  searchQuery,
  activeMatch,
  matchRefs,
}: {
  lineIndex: number;
  text: string;
  searchQuery: string;
  activeMatch: { lineIndex: number; start: number; end: number } | null;
  matchRefs: MutableRefObject<Map<string, HTMLSpanElement>>;
}) {
  let offset = 0;
  const query = searchQuery.trim();

  return (
    <>
      {formatConsoleLine(text).map((segment, segmentIndex) => {
        const startOffset = offset;
        offset += segment.text.length;
        return (
          <span
            key={`${segmentIndex}-${startOffset}`}
            className={clsx(
              segment.bold && "font-bold",
              segment.italic && "italic",
              segment.underline && "underline"
            )}
            style={segment.color ? { color: segment.color } : undefined}
          >
            {renderHighlightedText({
              text: segment.text,
              query,
              lineIndex,
              startOffset,
              activeMatch,
              matchRefs,
            })}
          </span>
        );
      })}
    </>
  );
}

function renderHighlightedText({
  text,
  query,
  lineIndex,
  startOffset,
  activeMatch,
  matchRefs,
}: {
  text: string;
  query: string;
  lineIndex: number;
  startOffset: number;
  activeMatch: { lineIndex: number; start: number; end: number } | null;
  matchRefs: MutableRefObject<Map<string, HTMLSpanElement>>;
}) {
  if (!query) return text;

  const parts: ReactNode[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;

  while (cursor < text.length) {
    const index = lowerText.indexOf(lowerQuery, cursor);
    if (index === -1) break;
    if (index > cursor) parts.push(text.slice(cursor, index));

    const absoluteStart = startOffset + index;
    const key = matchKey(lineIndex, absoluteStart);
    const isActive =
      activeMatch?.lineIndex === lineIndex && activeMatch.start === absoluteStart;
    parts.push(
      <span
        key={key}
        ref={(node) => {
          if (node) matchRefs.current.set(key, node);
          else matchRefs.current.delete(key);
        }}
        className={clsx(
          "console-search-highlight rounded px-0.5 transition-colors motion-reduce:transition-none",
          isActive
            ? "bg-copper text-carbon"
            : "bg-glowstone/25 text-white"
        )}
      >
        {text.slice(index, index + query.length)}
      </span>
    );
    cursor = index + query.length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length > 0 ? parts : text;
}

function matchKey(lineIndex: number, start: number): string {
  return `${lineIndex}:${start}`;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function lineTone(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("error") || lower.includes("exception") || lower.includes("failed")) {
    return "bg-redstone/5";
  }
  if (lower.includes("warn")) return "bg-glowstone/5";
  if (lower.includes("done") || lower.includes("started") || lower.includes("success")) {
    return "bg-grass/5";
  }
  return "";
}
