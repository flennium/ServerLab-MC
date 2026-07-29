import { create } from "zustand";
import type { ServerStatsPayload } from "@serverlab/shared";

// Keep last N stat ticks per server for sparkline charts
const MAX_HISTORY = 30;

interface StatHistory {
  cpu: number[];
  ramMb: number[];
  tps: number[];
  players: number[];
  latest: ServerStatsPayload | null;
}

interface StatsStore {
  stats: Record<string, StatHistory>;
  pushStats: (payload: ServerStatsPayload) => void;
  getStats: (serverId: string) => StatHistory;
}

const emptyHistory = (): StatHistory => ({
  cpu: [],
  ramMb: [],
  tps: [],
  players: [],
  latest: null,
});

export const useStatsStore = create<StatsStore>((set, get) => ({
  stats: {},

  pushStats: (payload) => {
    set((s) => {
      const prev = s.stats[payload.serverId] ?? emptyHistory();
      const push = <T>(arr: T[], val: T) =>
        [...arr, val].slice(-MAX_HISTORY);
      return {
        stats: {
          ...s.stats,
          [payload.serverId]: {
            cpu: push(prev.cpu, payload.cpu),
            ramMb: push(prev.ramMb, payload.ramMb),
            tps: push(prev.tps, payload.tps),
            players: push(prev.players, payload.players),
            latest: payload,
          },
        },
      };
    });
  },

  getStats: (serverId) => get().stats[serverId] ?? emptyHistory(),
}));
