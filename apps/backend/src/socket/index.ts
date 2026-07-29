import type { Server as IOServer } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "@serverlab/shared";
import { serverManager } from "../services/ServerManager.js";
import { logger } from "../lib/logger.js";

export function registerSocketHandlers(
  io: IOServer<ClientToServerEvents, ServerToClientEvents>
): void {
  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Client connected");

    // client → server: send a command to a running Minecraft server
    socket.on("console:command", ({ serverId, command }) => {
      try {
        serverManager.sendCommand(serverId, command);
      } catch (err) {
        logger.warn({ err, serverId }, "console:command failed");
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info({ socketId: socket.id, reason }, "Client disconnected");
    });
  });
}
