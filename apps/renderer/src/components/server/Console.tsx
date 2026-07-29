import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket } from "../../lib/socket.js";
import { api } from "../../lib/apiClient.js";
import type { ConsoleOutputPayload } from "@serverlab/shared";

interface ConsoleLine {
  timestamp: string;
  text: string;
}

/** Parse Minecraft §-colour codes into HTML spans */
function parseMinecraftColors(line: string): string {
  const COLOR_MAP: Record<string, string> = {
    "§0": "#000000", "§1": "#0000AA", "§2": "#00AA00", "§3": "#00AAAA",
    "§4": "#AA0000", "§5": "#AA00AA", "§6": "#FFAA00", "§7": "#AAAAAA",
    "§8": "#555555", "§9": "#5555FF", "§a": "#55FF55", "§b": "#55FFFF",
    "§c": "#FF5555", "§d": "#FF55FF", "§e": "#FFFF55", "§f": "#FFFFFF",
  };

  let html = "";
  let i = 0;
  let openSpan = false;

  while (i < line.length) {
    if (line[i] === "§" && i + 1 < line.length) {
      const code = line.slice(i, i + 2).toLowerCase();
      if (openSpan) { html += "</span>"; openSpan = false; }
      if (COLOR_MAP[code]) {
        html += `<span style="color:${COLOR_MAP[code]}">`;
        openSpan = true;
      }
      i += 2;
    } else {
      // Escape HTML entities
      const ch = line[i];
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  // Subscribe to Socket.IO console output for this server
  useEffect(() => {
    let cleanup = () => {};

    getSocket().then((socket) => {
      const handler = (payload: ConsoleOutputPayload) => {
        if (payload.serverId !== serverId) return;
        setLines((prev) => {
          const next = [
            ...prev,
            { timestamp: payload.timestamp, text: payload.line },
          ];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      };

      socket.on("console:output", handler);
      cleanup = () => socket.off("console:output", handler);
    });

    return () => cleanup();
  }, [serverId]);

  const sendCommand = useCallback(async () => {
    const cmd = input.trim();
    if (!cmd) return;

    setHistory((h) => [cmd, ...h.slice(0, 49)]);
    setHistoryIdx(-1);
    setInput("");

    try {
      await api.post(`/api/servers/${serverId}/command`, { command: cmd });
    } catch {
      // Command errors surface in the console stream itself
    }
  }, [input, serverId]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      sendCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setInput(history[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setInput(idx === -1 ? "" : (history[idx] ?? ""));
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-[#0a0a0a] overflow-hidden">
      {/* Output area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 console-font"
        style={{ height: "360px" }}
        role="log"
        aria-live="polite"
        aria-label="Server console output"
      >
        {lines.length === 0 && (
          <p className="text-muted">Console output will appear here once the server starts.</p>
        )}
        {lines.map((line, i) => (
          <div key={i} className="leading-relaxed whitespace-pre-wrap break-all">
            <span
              // Safe: we control this HTML — user-provided content goes through
              // entity-escaping in parseMinecraftColors before being injected.
              dangerouslySetInnerHTML={{ __html: parseMinecraftColors(line.text) }}
            />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="flex border-t border-border">
        <span className="flex items-center px-3 text-accent console-font select-none">
          &gt;
        </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command…"
          className="flex-1 bg-transparent py-2 pr-3 text-sm console-font text-white placeholder:text-muted focus:outline-none"
          aria-label="Console command input"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          onClick={sendCommand}
          className="px-4 text-xs font-medium text-muted hover:text-white transition-colors"
          aria-label="Send command"
        >
          Send
        </button>
      </div>
    </div>
  );
}
