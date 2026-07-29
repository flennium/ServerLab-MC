import { create } from "zustand";
import { api } from "../lib/apiClient.js";
import { getSocket } from "../lib/socket.js";
import { useStatsStore } from "./statsStore.js";
import type {
  Server,
  ServerListResponse,
  ServerResponse,
  CreateServerDto,
} from "@serverlab/shared";

interface ServerStore {
  servers: Server[];
  fetchServers: () => Promise<void>;
  createServer: (dto: CreateServerDto) => Promise<Server>;
  deleteServer: (id: string) => Promise<void>;
  startServer: (id: string) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  restartServer: (id: string) => Promise<void>;
  // Called by the socket listener to update a single server's status in-place
  _patchStatus: (serverId: string, status: Server["status"]) => void;
  // Initialise the realtime listener (called once on app mount)
  initSocket: () => Promise<void>;
}

export const useServerStore = create<ServerStore>((set, get) => ({
  servers: [],

  fetchServers: async () => {
    const { servers } = await api.get<ServerListResponse>("/api/servers");
    set({ servers });
  },

  createServer: async (dto) => {
    const { server } = await api.post<ServerResponse>("/api/servers", dto);
    set((s) => ({ servers: [...s.servers, server] }));
    return server;
  },

  deleteServer: async (id) => {
    await api.delete(`/api/servers/${id}`);
    set((s) => ({ servers: s.servers.filter((srv) => srv.id !== id) }));
  },

  startServer: async (id) => {
    await api.post(`/api/servers/${id}/start`);
    get()._patchStatus(id, "starting");
  },

  stopServer: async (id) => {
    await api.post(`/api/servers/${id}/stop`);
    get()._patchStatus(id, "stopping");
  },

  restartServer: async (id) => {
    await api.post(`/api/servers/${id}/restart`);
    get()._patchStatus(id, "starting");
  },

  _patchStatus: (serverId, status) => {
    set((s) => ({
      servers: s.servers.map((srv) =>
        srv.id === serverId ? { ...srv, status } : srv
      ),
    }));
  },

  initSocket: async () => {
    const socket = await getSocket();

    socket.on("server:status", ({ serverId, status }) => {
      get()._patchStatus(serverId, status);
    });

    socket.on("server:stats", (payload) => {
      useStatsStore.getState().pushStats(payload);
    });
  },
}));
