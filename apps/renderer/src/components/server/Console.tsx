import { useEffect, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { ArrowDownCircle, Copy, Pause, Play, Send, Terminal, Trash2 } from "lucide-react";
import { getSocket } from "../../lib/socket.js";
import { api } from "../../lib/apiClient.js";
import { formatConsoleLine } from "../../lib/consoleFormat.js";
import { Button, IconButton } from "../ui/Button.js";
import { Alert } from "../ui/Layout.js";
import type { ConsoleOutputPayload } from "@serverlab/shared";

interface ConsoleLine {
  timestamp: string;
  text: string;
}

interface ConsoleProps {
  serverId: string;
}

const MAX_LINES = 1000;

export function Console({ serverId }: ConsoleProps) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [paused, setPaused] = useState(false);
  const [sending, setSending] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedBufferRef = useRef<ConsoleLine[]>([]);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines, autoScroll]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }

  useEffect(() => {
    let cleanup = () => {};

    getSocket().then((socket) => {
      const handler = (payload: ConsoleOutputPayload) => {
        if (payload.serverId !== serverId) return;
        const nextLine = { timestamp: payload.timestamp, text: payload.line };
        if (paused) {
          pausedBufferRef.current = [...pausedBufferRef.current, nextLine].slice(
            -MAX_LINES
          );
          return;
        }
        setLines((previous) => {
          const next = [...previous, nextLine];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      };

      socket.on("console:output", handler);
      cleanup = () => socket.off("console:output", handler);
    });

    return () => cleanup();
  }, [paused, serverId]);

  const sendCommand = useCallback(async () => {
    const command = input.trim();
    if (!command || sending) return;
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
  }, [input, sending, serverId]);

  function togglePaused() {
    setPaused((current) => {
      if (current && pausedBufferRef.current.length > 0) {
        setLines((previous) =>
          [...previous, ...pausedBufferRef.current].slice(-MAX_LINES)
        );
        pausedBufferRef.current = [];
      }
      return !current;
    });
  }

  async function copyConsole() {
    const text = lines
      .map((line) => `[${new Date(line.timestamp).toLocaleTimeString()}] ${line.text}`)
      .join("\n");
    await navigator.clipboard?.writeText(text);
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

  return (
    <div className="flex h-[calc(100vh-17rem)] min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-surface-console shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-carbon px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal className="h-4 w-4 text-copper" aria-hidden="true" />
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted">
            Server console
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!autoScroll && (
            <Button
              onClick={() => {
                setAutoScroll(true);
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              icon={ArrowDownCircle}
              variant="quiet"
              size="sm"
            >
              Resume
            </Button>
          )}
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
          <IconButton icon={Trash2} label="Clear console" onClick={() => setLines([])} />
        </div>
      </div>

      {commandError && (
        <Alert tone="danger" className="m-3 mb-0">
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
            className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 whitespace-pre-wrap break-words leading-relaxed"
          >
            <span className="mr-3 select-none text-muted/60">
              {new Date(line.timestamp).toLocaleTimeString()}
            </span>
            <span>
              {formatConsoleLine(line.text).map((segment, segmentIndex) => (
                <span
                  key={segmentIndex}
                  className={clsx(
                    segment.bold && "font-bold",
                    segment.italic && "italic",
                    segment.underline && "underline"
                  )}
                  style={segment.color ? { color: segment.color } : undefined}
                >
                  {segment.text}
                </span>
              ))}
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
          disabled={sending}
          placeholder="Type a command and press Enter"
          className="console-font min-w-0 flex-1 bg-transparent py-3 pr-3 text-white placeholder:text-muted focus:outline-none"
          aria-label="Console command input"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          onClick={sendCommand}
          disabled={sending || !input.trim()}
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
