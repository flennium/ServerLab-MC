import express from "express";
import http from "http";
import { Server as IOServer } from "socket.io";
import cors from "cors";
import { logger } from "./lib/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { serverRoutes } from "./routes/servers.js";
import { templateRoutes } from "./routes/templates.js";
import { javaRoutes } from "./routes/java.js";
import { backupRoutes } from "./routes/backups.js";
import { registerSocketHandlers } from "./socket/index.js";
import { startMonitor, stopMonitor } from "./services/MonitorService.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@serverlab/shared";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const HOST = "127.0.0.1"; // local only — never expose to the network

const app = express();
const httpServer = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
export const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(
  httpServer,
  {
    cors: { origin: "*" }, // only reachable from 127.0.0.1 anyway
  }
);

// ─── Express middleware ───────────────────────────────────────────────────────
app.use(
  cors({
    origin: [
      "http://localhost:5173", // Vite dev server
      "http://127.0.0.1:5173",
    ],
  })
);
app.use(express.json());
app.use(authMiddleware);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/servers", serverRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/java", javaRoutes);
app.use("/api/backups", backupRoutes);

// Health-check (unauthenticated — Electron uses this to know the backend is up)
app.get("/health", (_req, res) => res.json({ ok: true }));

// Data path (unauthenticated — used by SettingsPage open-data-folder)
app.get("/api/data-path", (_req, res) => {
  res.json({ path: process.cwd() });
});

app.use(errorHandler);

// ─── Socket handlers ──────────────────────────────────────────────────────────
registerSocketHandlers(io);

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, HOST, () => {
  logger.info(`ServerLab MC backend listening on ${HOST}:${PORT}`);
  startMonitor();
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down");
  stopMonitor();
  httpServer.close(() => process.exit(0));
});
