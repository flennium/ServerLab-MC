import type { Server as IOServer } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@serverlab/shared";

let socketServer: IOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

export function setSoftwareSocketServer(
  io: IOServer<ClientToServerEvents, ServerToClientEvents>
): void {
  socketServer = io;
}

export function getSoftwareSocketServer():
  | IOServer<ClientToServerEvents, ServerToClientEvents>
  | null {
  return socketServer;
}
