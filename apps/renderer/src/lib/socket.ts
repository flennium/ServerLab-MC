import { io, Socket } from "socket.io-client";
import { api } from "./apiClient.js";
import { createRendererError, pushError } from "./errorStore.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@serverlab/shared";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: AppSocket | null = null;
let socketPromise: Promise<AppSocket> | null = null;

export async function getSocket(): Promise<AppSocket> {
  // Keep one socket instance across temporary disconnects so Socket.IO's
  // built-in reconnect does not race a second client into existence.
  if (socketInstance) return socketInstance;
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

      let lastConnectionErrorAt = 0;
      socketInstance.on("connect_error", (error) => {
        const now = Date.now();
        if (now - lastConnectionErrorAt < 5000) return;
        lastConnectionErrorAt = now;
        const unauthorized = /unauthorized/i.test(error.message);
        pushError(
          createRendererError({
            category: unauthorized ? "auth" : "network",
            severity: "warning",
            userMessage: unauthorized
              ? "ServerLab could not authenticate the live connection."
              : "The live server connection is unavailable.",
            technicalDetails: error.stack ?? error.message,
            possibleSolution: unauthorized
              ? "Restart ServerLab MC to refresh its local connection."
              : "Retry after the local backend finishes starting.",
            source: "renderer:socket",
            action: "socket-connect",
            recoveries: ["retry", "open-logs", "copy-details", "dismiss"],
          }),
          { report: true }
        );
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
