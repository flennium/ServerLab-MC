import { create } from "zustand";
import { getSocket } from "../lib/socket.js";
import type { ConsoleOutputPayload } from "@serverlab/shared";

export interface ConsoleLine {
  timestamp: string;
  text: string;
}

interface ConsoleStore {
  linesByServer: Record<string, ConsoleLine[]>;
  pausedByServer: Record<string, boolean>;
  pausedBuffersByServer: Record<string, ConsoleLine[]>;
  initialized: boolean;
  clearLines: (serverId: string) => void;
  setPaused: (serverId: string, paused: boolean) => void;
  initSocket: () => Promise<void>;
}

const MAX_LINES = 1000;
let socketInitPromise: Promise<void> | null = null;

function pushBounded(lines: ConsoleLine[], line: ConsoleLine): ConsoleLine[] {
  const next = [...lines, line];
  return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
}

export const useConsoleStore = create<ConsoleStore>((set, get) => ({
  linesByServer: {},
  pausedByServer: {},
  pausedBuffersByServer: {},
  initialized: false,

  clearLines: (serverId) => {
    set((state) => ({
      linesByServer: { ...state.linesByServer, [serverId]: [] },
      pausedBuffersByServer: { ...state.pausedBuffersByServer, [serverId]: [] },
    }));
  },

  setPaused: (serverId, paused) => {
    set((state) => {
      const buffered = state.pausedBuffersByServer[serverId] ?? [];
      const currentLines = state.linesByServer[serverId] ?? [];

      return {
        pausedByServer: { ...state.pausedByServer, [serverId]: paused },
        linesByServer:
          !paused && buffered.length > 0
            ? {
                ...state.linesByServer,
                [serverId]: [...currentLines, ...buffered].slice(-MAX_LINES),
              }
            : state.linesByServer,
        pausedBuffersByServer:
          !paused && buffered.length > 0
            ? { ...state.pausedBuffersByServer, [serverId]: [] }
            : state.pausedBuffersByServer,
      };
    });
  },

  initSocket: async () => {
    if (get().initialized) return;
    if (socketInitPromise) return socketInitPromise;

    socketInitPromise = (async () => {
      const socket = await getSocket();
      socket.on("console:output", (payload: ConsoleOutputPayload) => {
        const nextLine = { timestamp: payload.timestamp, text: payload.line };
        const serverId = payload.serverId;

        set((state) => {
          if (state.pausedByServer[serverId]) {
            return {
              pausedBuffersByServer: {
                ...state.pausedBuffersByServer,
                [serverId]: pushBounded(
                  state.pausedBuffersByServer[serverId] ?? [],
                  nextLine
                ),
              },
            };
          }

          return {
            linesByServer: {
              ...state.linesByServer,
              [serverId]: pushBounded(state.linesByServer[serverId] ?? [], nextLine),
            },
          };
        });
      });
      set({ initialized: true });
    })().catch((error) => {
      socketInitPromise = null;
      throw error;
    });

    return socketInitPromise;
  },
}));
