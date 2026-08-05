import { execFile } from "child_process";
import { createServer } from "net";
import { promisify } from "util";
import { prisma } from "../lib/prisma.js";
import type {
  PortReservationOwner,
  PortReservationOwnerType,
  PortStatus,
} from "@serverlab/shared";

const execFileAsync = promisify(execFile);
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_MINECRAFT_PORT = 25565;

interface Reservation extends PortReservationOwner {
  port: number;
  host: string;
  startedAt: string;
}

interface ProcessOwner {
  processId: number | null;
  processName: string | null;
  commandLine: string | null;
}

export class PortConflictError extends Error {
  constructor(public readonly status: PortStatus) {
    super(status.message);
  }
}

class PortManagerService {
  private readonly reservations = new Map<string, Reservation>();

  async checkPort({
    port,
    host = DEFAULT_HOST,
    excludeServerId,
    includeSuggestion = true,
    checkSavedServers = true,
  }: {
    port: number;
    host?: string;
    excludeServerId?: string | null;
    includeSuggestion?: boolean;
    checkSavedServers?: boolean;
  }): Promise<PortStatus> {
    this.assertValidPort(port);

    const ownReservation = [...this.reservations.values()].find(
      (item) =>
        item.port === port &&
        item.ownerId === excludeServerId &&
        this.hostsOverlap(item.host, host)
    );
    if (ownReservation) {
      return {
        port,
        host,
        available: true,
        ownerType: ownReservation.ownerType,
        ownerId: ownReservation.ownerId,
        ownerName: ownReservation.ownerName ?? null,
        source: "serverlab-running",
        processId: null,
        processName: null,
        commandLine: null,
        suggestedPort: null,
        message: `Port ${port} is owned by this running server.`,
      };
    }

    const reservation = [...this.reservations.values()].find(
      (item) =>
        item.port === port &&
        item.ownerId !== excludeServerId &&
        this.hostsOverlap(item.host, host)
    );

    if (reservation) {
      return this.withSuggestion(
        {
          port,
          host,
          available: false,
          ownerType: reservation.ownerType,
          ownerId: reservation.ownerId,
          ownerName: reservation.ownerName ?? null,
          source: "serverlab-running",
          processId: null,
          processName: null,
          commandLine: null,
          suggestedPort: null,
          message: `Port ${port} is already used by running server "${reservation.ownerName ?? reservation.ownerId}".`,
        },
        excludeServerId,
        includeSuggestion,
        checkSavedServers
      );
    }

    const savedServer = checkSavedServers
      ? await prisma.server.findFirst({
          where: {
            port,
            ...(excludeServerId ? { id: { not: excludeServerId } } : {}),
          },
          select: { id: true, name: true },
        })
      : null;

    if (savedServer) {
      return this.withSuggestion(
        {
          port,
          host,
          available: false,
          ownerType: "server",
          ownerId: savedServer.id,
          ownerName: savedServer.name,
          source: "serverlab-saved",
          processId: null,
          processName: null,
          commandLine: null,
          suggestedPort: null,
          message: `Port ${port} is already assigned to "${savedServer.name}".`,
        },
        excludeServerId,
        includeSuggestion,
        checkSavedServers
      );
    }

    const free = await this.canBind(port, host);
    if (free) {
      return {
        port,
        host,
        available: true,
        ownerType: null,
        ownerId: null,
        ownerName: null,
        source: "available",
        processId: null,
        processName: null,
        commandLine: null,
        suggestedPort: null,
        message: `Port ${port} is available.`,
      };
    }

    const owner = await this.findProcessOwner(port);
    return this.withSuggestion(
      {
        port,
        host,
        available: false,
        ownerType: null,
        ownerId: null,
        ownerName: owner.processName,
        source: owner.processId ? "external" : "unknown",
        processId: owner.processId,
        processName: owner.processName,
        commandLine: owner.commandLine,
        suggestedPort: null,
        message: owner.processName
          ? `Port ${port} is already used by ${owner.processName}.`
          : `Port ${port} is already in use.`,
      },
      excludeServerId,
      includeSuggestion,
      checkSavedServers
    );
  }

  async suggestPort(
    start = DEFAULT_MINECRAFT_PORT,
    excludeServerId?: string | null,
    options: { checkSavedServers?: boolean } = {}
  ): Promise<number> {
    this.assertValidPort(start);
    for (let port = start; port <= 65535; port += 1) {
      const status = await this.checkPort({
        port,
        excludeServerId,
        includeSuggestion: false,
        checkSavedServers: options.checkSavedServers ?? true,
      });
      if (status.available) return port;
    }
    throw new Error("No available Minecraft server port was found.");
  }

  reservePort(input: PortReservationOwner & { port: number; host?: string }): void {
    this.assertValidPort(input.port);
    this.reservations.set(this.key(input.ownerType, input.ownerId), {
      ...input,
      host: input.host ?? DEFAULT_HOST,
      startedAt: new Date().toISOString(),
    });
  }

  releasePort(input: { ownerType: PortReservationOwnerType; ownerId: string }): void {
    this.reservations.delete(this.key(input.ownerType, input.ownerId));
  }

  async assertAvailableForServer(port: number, serverId?: string | null): Promise<void> {
    const status = await this.checkPort({ port, excludeServerId: serverId });
    if (!status.available) throw new PortConflictError(status);
  }

  async listPortStatuses(): Promise<PortStatus[]> {
    const servers = await prisma.server.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, port: true },
    });
    const seen = new Set<string>();
    const statuses: PortStatus[] = [];

    for (const server of servers) {
      const status = await this.checkPort({
        port: server.port,
        excludeServerId: server.id,
      });
      statuses.push({
        ...status,
        ownerType: status.available ? "server" : status.ownerType,
        ownerId: status.available ? server.id : status.ownerId,
        ownerName: status.available ? server.name : status.ownerName,
        source: status.available ? "serverlab-saved" : status.source,
        available: status.available,
        message: status.available
          ? `Port ${server.port} is assigned to "${server.name}" and currently free.`
          : status.message,
      });
      seen.add(String(server.port));
    }

    for (const reservation of this.reservations.values()) {
      if (seen.has(String(reservation.port))) continue;
      statuses.push(await this.checkPort({ port: reservation.port }));
    }

    return statuses.sort((a, b) => a.port - b.port);
  }

  private async withSuggestion(
    status: PortStatus,
    excludeServerId: string | null | undefined,
    includeSuggestion: boolean,
    checkSavedServers: boolean
  ): Promise<PortStatus> {
    if (!includeSuggestion) return status;
    return {
      ...status,
      suggestedPort: await this.suggestPort(status.port + 1, excludeServerId, {
        checkSavedServers,
      }).catch(() => null),
    };
  }

  private canBind(port: number, host: string): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(port, host);
    });
  }

  private async findProcessOwner(port: number): Promise<ProcessOwner> {
    if (process.platform !== "win32") {
      return { processId: null, processName: null, commandLine: null };
    }

    try {
      const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"]);
      const line = stdout
        .split(/\r?\n/)
        .map((item) => item.trim())
        .find((item) => item.includes(`:${port} `) && item.includes("LISTENING"));
      const pid = line ? Number(line.split(/\s+/).at(-1)) : NaN;
      if (!Number.isInteger(pid)) {
        return { processId: null, processName: null, commandLine: null };
      }
      const processInfo = await this.windowsProcessInfo(pid);
      return { processId: pid, ...processInfo };
    } catch {
      return { processId: null, processName: null, commandLine: null };
    }
  }

  private async windowsProcessInfo(pid: number): Promise<Omit<ProcessOwner, "processId">> {
    try {
      const escaped = String(pid).replace(/'/g, "''");
      const command = `Get-CimInstance Win32_Process -Filter "ProcessId=${escaped}" | Select-Object -First 1 ProcessId,Name,CommandLine | ConvertTo-Json -Compress`;
      const { stdout } = await execFileAsync("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command,
      ]);
      const parsed = JSON.parse(stdout || "{}") as { Name?: string; CommandLine?: string };
      return {
        processName: parsed.Name ?? null,
        commandLine: parsed.CommandLine ?? null,
      };
    } catch {
      return { processName: null, commandLine: null };
    }
  }

  private hostsOverlap(a: string, b: string): boolean {
    return a === b || a === "0.0.0.0" || b === "0.0.0.0";
  }

  private key(ownerType: PortReservationOwnerType, ownerId: string): string {
    return `${ownerType}:${ownerId}`;
  }

  private assertValidPort(port: number): void {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Port must be between 1 and 65535.");
    }
  }
}

export const portManagerService = new PortManagerService();
