import type { Server as IOServer } from "socket.io";
import type { AppError, ServerToClientEvents, ClientToServerEvents } from "@serverlab/shared";
import { serverManager } from "../services/ServerManager.js";
import { logger } from "../lib/logger.js";
import { errorService } from "../services/ErrorService.js";

export function registerSocketHandlers(
  io: IOServer<ClientToServerEvents, ServerToClientEvents>
): void {
  const backendToken = process.env.BACKEND_TOKEN;

  io.use((socket, next) => {
    if (!backendToken) {
      next();
      return;
    }

    if (socket.handshake.auth?.token === backendToken) {
      next();
      return;
    }

    next(new Error("Unauthorized"));
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Client connected");

    socket.on(
      "console:command",
      (
        { serverId, command },
        ack?: (result: { ok: boolean; error?: AppError }) => void
      ) => {
        try {
          if (!command?.trim()) {
            const error = errorService.createFromUnknown("Command is required", {
              category: "server",
              severity: "warning",
              userMessage: "Enter a console command first.",
              possibleSolution: "Type a command and press Enter.",
              source: "backend:socket",
              action: "console-command",
            });
            void errorService.record(error);
            ack?.({ ok: false, error });
            return;
          }
          if (!serverManager.isRunning(serverId)) {
            const error = errorService.createFromUnknown("Server is not running", {
              category: "server",
              severity: "warning",
              userMessage: "Start the server before sending console commands.",
              possibleSolution: "Start the server, then send the command again.",
              source: "backend:socket",
              action: "console-command",
            });
            void errorService.record(error);
            ack?.({ ok: false, error });
            return;
          }
          serverManager.sendCommand(serverId, command);
          ack?.({ ok: true });
        } catch (err) {
          logger.warn({ err, serverId }, "console:command failed");
          const error = errorService.createFromUnknown(err, {
            category: "server",
            userMessage: "The console command could not be sent.",
            possibleSolution: "Check the server state and try again.",
            source: "backend:socket",
            action: "console-command",
          });
          void errorService.record(error);
          ack?.({
            ok: false,
            error,
          });
        }
      }
    );

    socket.on("disconnect", (reason) => {
      logger.info({ socketId: socket.id, reason }, "Client disconnected");
    });
  });
}
