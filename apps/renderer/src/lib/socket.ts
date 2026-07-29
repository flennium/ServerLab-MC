import { io, Socket } from "socket.io-client";
import { api } from "./apiClient.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@serverlab/shared";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: AppSocket | null = null;

export async function getSocket(): Promise<AppSocket> {
  if (socketInstance?.connected) return socketInstance;

  const { origin, token } = await api.getConfig();

  socketInstance = io(origin, {
    auth: { token },
    transports: ["websocket"],
    reconnectionAttempts: 10,
    reconnectionDelay: 1500,
  }) as AppSocket;

  return socketInstance;
}

export function getSocketSync(): AppSocket | null {
  return socketInstance;
}
