import express from "express";
import http from "http";
import { Server as IOServer } from "socket.io";
import cors from "cors";
import type { CorsOptions } from "cors";
import { logger } from "./lib/logger.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/error.js";
import { serverRoutes } from "./routes/servers.js";
import { templateRoutes } from "./routes/templates.js";
import { javaRoutes } from "./routes/java.js";
import { backupRoutes } from "./routes/backups.js";
import { softwareRoutes } from "./routes/software.js";
import { modrinthRoutes } from "./routes/modrinth.js";
import { errorRoutes } from "./routes/errors.js";
import { logRoutes } from "./routes/logs.js";
import { portRoutes } from "./routes/ports.js";
import { registerSocketHandlers } from "./socket/index.js";
import { startMonitor, stopMonitor } from "./services/MonitorService.js";
import { ensureDatabaseSchema } from "./services/DatabaseSchemaService.js";
import { softwareCacheService } from "./services/software/SoftwareCacheService.js";
import { setSoftwareSocketServer } from "./services/software/softwareEvents.js";
import { javaInstallService } from "./services/java/JavaInstallService.js";
import { pluginInstallService } from "./services/plugins/PluginInstallService.js";
import { setPluginSocketServer } from "./services/plugins/pluginEvents.js";
import { serverManager } from "./services/ServerManager.js";
import { errorService } from "./services/ErrorService.js";
import type { ServerToClientEvents, ClientToServerEvents } from "@serverlab/shared";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const HOST = "127.0.0.1";
const ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const corsOrigin: NonNullable<CorsOptions["origin"]> = (origin, callback) => {
  if (!origin || origin === "file://" || ALLOWED_ORIGINS.includes(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error("Origin not allowed"));
};

const app = express();
const httpServer = http.createServer(app);

export const io = new IOServer<ClientToServerEvents, ServerToClientEvents>(
  httpServer,
  {
    cors: { origin: corsOrigin },
  }
);
setSoftwareSocketServer(io);
setPluginSocketServer(io);

app.use(
  cors({
    origin: corsOrigin,
  })
);
app.use(express.json());
app.use(authMiddleware);

app.use("/api/servers", serverRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/java", javaRoutes);
app.use("/api/backups", backupRoutes);
app.use("/api/software", softwareRoutes);
app.use("/api/modrinth", modrinthRoutes);
app.use("/api/errors", errorRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/ports", portRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/api/data-path", (_req, res) => {
  const dataDir = process.env.DATA_DIR ?? process.cwd();
  res.json({ path: dataDir });
});

app.use(errorHandler);

registerSocketHandlers(io);

async function start(): Promise<void> {
  await ensureDatabaseSchema();
  await serverManager.restoreTrackedProcesses();

  httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.error({ port: PORT, host: HOST }, "Backend port is already in use");
    }
    const appError = errorService.createFromUnknown(error, {
      category: "network",
      severity: "critical",
      userMessage: error.code === "EADDRINUSE"
        ? `The backend port ${PORT} is already in use.`
        : "The local backend could not start.",
      possibleSolution: "Close the process using the port and restart ServerLab MC.",
      source: "backend:startup",
      action: "listen",
      recoveries: ["retry", "open-logs", "copy-details", "dismiss"],
    });
    void errorService.record(appError).finally(() => process.exit(1));
  });

  httpServer.listen(PORT, HOST, () => {
    const dataDir = process.env.DATA_DIR ?? process.cwd();
    logger.info(`ServerLab MC backend listening on ${HOST}:${PORT}`);
    logger.info(`Data directory: ${dataDir}`);
    softwareCacheService.cleanupTmp().catch((err) => {
      logger.warn({ err }, "Failed to clean software cache tmp directory");
      void errorService.record(errorService.createFromUnknown(err, {
        category: "download",
        severity: "warning",
        userMessage: "Temporary software download files could not be cleaned up.",
        possibleSolution: "Restart ServerLab MC and try again.",
        source: "backend:startup",
        action: "cleanup-software-cache",
      }));
    });
    javaInstallService.cleanupTmp().catch((err) => {
      logger.warn({ err }, "Failed to clean Java runtime tmp directory");
      void errorService.record(errorService.createFromUnknown(err, {
        category: "java",
        severity: "warning",
        userMessage: "Temporary Java download files could not be cleaned up.",
        possibleSolution: "Restart ServerLab MC and try again.",
        source: "backend:startup",
        action: "cleanup-java-cache",
      }));
    });
    pluginInstallService.cleanupStaging().catch((err) => {
      logger.warn({ err }, "Failed to clean plugin staging directories");
      void errorService.record(errorService.createFromUnknown(err, {
        category: "plugin",
        severity: "warning",
        userMessage: "Temporary plugin files could not be cleaned up.",
        possibleSolution: "Restart ServerLab MC and try again.",
        source: "backend:startup",
        action: "cleanup-plugin-staging",
      }));
    });
    startMonitor();
  });
}

process.on("unhandledRejection", (reason) => {
  const error = errorService.createFromUnknown(reason, {
    category: "unknown",
    severity: "error",
    userMessage: "A background backend operation failed.",
    possibleSolution: "Retry the action and check Error history if it continues.",
    source: "backend:process",
    action: "unhandled-rejection",
  });
  void errorService.record(error);
});

process.on("uncaughtException", (reason) => {
  const error = errorService.createFromUnknown(reason, {
    category: "unknown",
    severity: "critical",
    userMessage: "The local backend encountered a critical error.",
    possibleSolution: "Restart ServerLab MC and open Error history if it happens again.",
    source: "backend:process",
    action: "uncaught-exception",
  });
  void errorService.record(error).finally(() => process.exit(1));
});

start().catch((err) => {
  logger.error({ err }, "Backend startup failed");
  process.exit(1);
});

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received; shutting down");
  stopMonitor();
  await serverManager.stopAll({ wait: true, timeoutMs: 20_000 }).catch((error) => {
    logger.warn({ error }, "Failed to stop all Minecraft servers during shutdown");
    void errorService.record(errorService.createFromUnknown(error, {
      category: "server",
      severity: "warning",
      userMessage: "Some Minecraft servers did not stop cleanly.",
      possibleSolution: "Check the server processes before launching again.",
      source: "backend:shutdown",
      action: "stop-all-servers",
    }));
  });
  httpServer.close(() => process.exit(0));
});
