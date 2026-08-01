import { io, Socket } from "socket.io-client";
import { api } from "./apiClient.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@serverlab/shared";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: AppSocket | null = null;
let socketPromise: Promise<AppSocket> | null = null;

export async function getSocket(): Promise<AppSocket> {
  if (socketInstance?.connected) return socketInstance;
  if (socketPromise) return socketPromise;

  socketPromise = api
    .getConfig()
    .then(({ origin, token }) => {
      socketInstance = io(origin, {
        auth: { token },
        transports: ["websocket"],
        reconnectionAttempts: 10,
        reconnectionDelay: 1500,
      }) as AppSocket;

      socketInstance.on("disconnect", () => {
        socketPromise = null;
      });

      return socketInstance;
    })
    .catch((error) => {
      socketPromise = null;
      throw error;
    });

  return socketPromise;
}

export function getSocketSync(): AppSocket | null {
  return socketInstance;
}
