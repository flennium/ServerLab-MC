import type { Server as IOServer } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@serverlab/shared";

let io: IOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

export function setPluginSocketServer(
  server: IOServer<ClientToServerEvents, ServerToClientEvents>
): void {
  io = server;
}

export function getPluginSocketServer():
  | IOServer<ClientToServerEvents, ServerToClientEvents>
  | null {
  return io;
}
