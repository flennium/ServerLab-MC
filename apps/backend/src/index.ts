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
import { softwareRoutes } from "./routes/software.js";
import { registerSocketHandlers } from "./socket/index.js";
import { startMonitor, stopMonitor } from "./services/MonitorService.js";
import { ensureDatabaseSchema } from "./services/DatabaseSchemaService.js";
import { softwareCacheService } from "./services/software/SoftwareCacheService.js";
import { setSoftwareSocketServer } from "./services/software/softwareEvents.js";
import { javaInstallService } from "./services/java/JavaInstallService.js";
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
setSoftwareSocketServer(io);

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
app.use("/api/software", softwareRoutes);

// Health-check (unauthenticated — Electron uses this to know the backend is up)
app.get("/health", (_req, res) => res.json({ ok: true }));

// Data path (unauthenticated — used by SettingsPage open-data-folder)
app.get("/api/data-path", (_req, res) => {
  const dataDir = process.env.DATA_DIR ?? process.cwd();
  res.json({ path: dataDir });
});

app.use(errorHandler);

// ─── Socket handlers ──────────────────────────────────────────────────────────
registerSocketHandlers(io);

// ─── Start ────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await ensureDatabaseSchema();

  httpServer.listen(PORT, HOST, () => {
    const dataDir = process.env.DATA_DIR ?? process.cwd();
    logger.info(`ServerLab MC backend listening on ${HOST}:${PORT}`);
    logger.info(`Data directory: ${dataDir}`);
    softwareCacheService.cleanupTmp().catch((err) => {
      logger.warn({ err }, "Failed to clean software cache tmp directory");
    });
    javaInstallService.cleanupTmp().catch((err) => {
      logger.warn({ err }, "Failed to clean Java runtime tmp directory");
    });
    startMonitor();
  });
}

start().catch((err) => {
  logger.error({ err }, "Backend startup failed");
  process.exit(1);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down");
  stopMonitor();
  httpServer.close(() => process.exit(0));
});
