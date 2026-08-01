import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowDownCircle, Send, Terminal, Trash2 } from "lucide-react";
import { getSocket } from "../../lib/socket.js";
import { api } from "../../lib/apiClient.js";
import { Button, IconButton } from "../ui/Button.js";
import type { ConsoleOutputPayload } from "@serverlab/shared";

interface ConsoleLine {
  timestamp: string;
  text: string;
}

function parseMinecraftColors(line: string): string {
  const normalized = line.replace(/\u00c2\u00a7/g, "\u00a7");
  const colorMap: Record<string, string> = {
    "\u00a70": "#000000",
    "\u00a71": "#0000AA",
    "\u00a72": "#00AA00",
    "\u00a73": "#00AAAA",
    "\u00a74": "#AA0000",
    "\u00a75": "#AA00AA",
    "\u00a76": "#FFAA00",
    "\u00a77": "#AAAAAA",
    "\u00a78": "#555555",
    "\u00a79": "#5555FF",
    "\u00a7a": "#55FF55",
    "\u00a7b": "#55FFFF",
    "\u00a7c": "#FF5555",
    "\u00a7d": "#FF55FF",
    "\u00a7e": "#FFFF55",
    "\u00a7f": "#FFFFFF",
  };

  let html = "";
  let i = 0;
  let openSpan = false;

  while (i < normalized.length) {
    if (normalized[i] === "\u00a7" && i + 1 < normalized.length) {
      const code = normalized.slice(i, i + 2).toLowerCase();
      if (openSpan) {
        html += "</span>";
        openSpan = false;
      }
      if (colorMap[code]) {
        html += `<span style="color:${colorMap[code]}">`;
        openSpan = true;
      }
      i += 2;
    } else {
      const ch = normalized[i];
      if (ch === "<") html += "&lt;";
      else if (ch === ">") html += "&gt;";
      else if (ch === "&") html += "&amp;";
      else html += ch;
      i++;
    }
  }

  if (openSpan) html += "</span>";
  return html;
}

interface ConsoleProps {
  serverId: string;
}

const MAX_LINES = 500;

export function Console({ serverId }: ConsoleProps) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
        setLines((previous) => {
          const next = [...previous, { timestamp: payload.timestamp, text: payload.line }];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      };

      socket.on("console:output", handler);
      cleanup = () => socket.off("console:output", handler);
    });

    return () => cleanup();
  }, [serverId]);

  const sendCommand = useCallback(async () => {
    const command = input.trim();
    if (!command) return;
    setHistory((previous) => [command, ...previous.slice(0, 49)]);
    setHistoryIdx(-1);
    setInput("");
    try {
      await api.post(`/api/servers/${serverId}/command`, { command });
    } catch {
      // Command failures are reported by the server console stream.
    }
  }, [input, serverId]);

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
      setInput(idx === -1 ? "" : history[idx] ?? "");
    }
  }

  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-border bg-surface-console shadow-2xl">
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
          <IconButton icon={Trash2} label="Clear console" onClick={() => setLines([])} />
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 console-font"
        role="log"
        aria-live="polite"
        aria-label="Server console output"
      >
        {lines.length === 0 && (
          <p className="text-xs text-muted">Console output appears here after the server starts.</p>
        )}
        {lines.map((line, index) => (
          <div key={`${line.timestamp}-${index}`} className="whitespace-pre-wrap break-all leading-relaxed">
            <span className="mr-3 select-none text-muted/60">
              {new Date(line.timestamp).toLocaleTimeString()}
            </span>
            <span dangerouslySetInnerHTML={{ __html: parseMinecraftColors(line.text) }} />
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
          placeholder="Type a command and press Enter"
          className="console-font min-w-0 flex-1 bg-transparent py-3 pr-3 text-white placeholder:text-muted focus:outline-none"
          aria-label="Console command input"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          onClick={sendCommand}
          className="inline-flex items-center gap-2 border-l border-border px-4 text-xs font-semibold text-muted transition-colors hover:bg-rail hover:text-white"
          aria-label="Send command"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Send
        </button>
      </div>
    </div>
  );
}
