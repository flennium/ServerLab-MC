import { create } from "zustand";
import { api } from "../lib/apiClient.js";
import { getSocket } from "../lib/socket.js";
import { useStatsStore } from "./statsStore.js";
import type {
  Server,
  DeleteServerResponse,
  ServerListResponse,
  ServerResponse,
  CreateServerDto,
} from "@serverlab/shared";

interface ServerStore {
  servers: Server[];
  initialized: boolean;
  fetchServers: () => Promise<void>;
  createServer: (dto: CreateServerDto) => Promise<Server>;
  deleteServer: (id: string) => Promise<DeleteServerResponse>;
  startServer: (id: string) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  restartServer: (id: string) => Promise<void>;
  // Called by the socket listener to update a single server's status in-place
  _patchStatus: (serverId: string, status: Server["status"]) => void;
  // Initialise the realtime listener (called once on app mount)
  initSocket: () => Promise<void>;
}

let socketInitPromise: Promise<void> | null = null;

export const useServerStore = create<ServerStore>((set, get) => ({
  servers: [],
  initialized: false,

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
    const response = await api.delete<DeleteServerResponse>(`/api/servers/${id}`);
    set((s) => ({ servers: s.servers.filter((srv) => srv.id !== id) }));
    return response;
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
      servers: s.servers.map((srv) => (srv.id === serverId ? { ...srv, status } : srv)),
    }));
  },

  initSocket: async () => {
    if (get().initialized) return;
    if (socketInitPromise) return socketInitPromise;

    socketInitPromise = (async () => {
      const socket = await getSocket();

      socket.on("server:status", ({ serverId, status }) => {
        get()._patchStatus(serverId, status);
      });

      socket.on("server:stats", (payload) => {
        useStatsStore.getState().pushStats(payload);
      });
      set({ initialized: true });
    })().catch((error) => {
      socketInitPromise = null;
      throw error;
    });

    return socketInitPromise;
  },
}));
