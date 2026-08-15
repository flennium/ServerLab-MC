import crypto from "crypto";
import { type ChildProcess } from "child_process";
import fs from "fs/promises";
import path from "path";
import treeKill from "tree-kill";
import type {
  BuildToolsPreflightResult,
  ServerFramework,
  SoftwareArtifact,
  SoftwareBuildJob,
  SoftwareBuildProgressPayload,
  SoftwareBuildStage,
  SoftwareBuildJobStatus,
} from "@serverlab/shared";
import { prisma } from "../../lib/prisma.js";
import { errorService } from "../ErrorService.js";
import { logger } from "../../lib/logger.js";
import { javaRuntimeRegistry } from "../java/JavaRuntimeRegistry.js";
import { javaRuntimeValidator } from "../java/JavaRuntimeValidator.js";
import { softwareCacheService } from "./SoftwareCacheService.js";
import { getSoftwareSocketServer } from "./softwareEvents.js";
import { buildToolsProvider, type BuildToolsRelease } from "./BuildToolsProvider.js";
import { buildToolsProcessRunner } from "./BuildToolsProcessRunner.js";
import { portableGitService, type PortableGitEnvironment } from "./PortableGitService.js";

const REQUIRED_DISK_BYTES = 2 * 1024 * 1024 * 1024;
const ACTIVE_STATUSES = [
  "queued",
  "preflight",
  "downloading-tool",
  "preparing-workspace",
  "building",
  "validating",
] as const;

interface BuildInput {
  provider: "spigot";
  minecraftVersion: string;
  javaRuntimeId?: string;
}

interface ActiveBuild {
  child?: ChildProcess;
  cancelled: boolean;
  workspacePath: string;
}

type BuildRecord = Awaited<ReturnType<typeof prisma.softwareBuildJob.findUnique>>;

function toJob(record: BuildRecord): SoftwareBuildJob {
  if (!record) throw new Error("Software build job not found");
  return {
    id: record.id,
    provider: record.provider as ServerFramework,
    minecraftVersion: record.minecraftVersion,
    buildId: record.buildId,
    toolVersion: record.toolVersion,
    status: record.status as SoftwareBuildJobStatus,
    stage: record.stage as SoftwareBuildStage,
    bytesReceived: record.bytesReceived,
    totalBytes: record.totalBytes,
    percent: record.percent,
    pid: record.pid,
    workspacePath: record.workspacePath,
    logPath: record.logPath,
    artifactPath: record.artifactPath,
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
  };
}

function requiredBuildJava(version: string): number {
  const match = version.match(/^1\.(\d+)(?:\.(\d+))?/);
  if (!match) return 17;
  const minor = Number(match[1]);
  const patch = Number(match[2] ?? 0);
  if (minor < 17) return 8;
  if (minor === 17 && patch === 0) return 16;
  return minor >= 20 && patch >= 5 ? 21 : 17;
}

function javaCompilerPath(javaPath: string): string {
  const executable = process.platform === "win32" ? "javac.exe" : "javac";
  if (javaPath === "java") return executable;
  return path.join(path.dirname(javaPath), executable);
}

function safeLogLine(value: string, workspacePath: string): string {
  return value
    .split(workspacePath).join("<build-workspace>")
    .split(process.env.DATA_DIR ?? process.cwd()).join("<app-data>")
    .replace(/\b[A-Za-z]:\\[^\r\n ]+/g, "<path>")
    .trim();
}

export class SpigotBuildService {
  private readonly active = new Map<string, ActiveBuild>();
  private readonly buildRoot = path.join(softwareCacheService.root, "builds");
  private readonly buildToolsRoot = path.join(softwareCacheService.root, "buildtools");

  async recoverStaleJobs(): Promise<void> {
    const stale = await prisma.softwareBuildJob.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] } },
    });
    await Promise.all(
      stale.map((job) =>
        prisma.softwareBuildJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            stage: "failed",
            error: "BuildTools stopped when the backend restarted.",
          },
        })
      )
    );
  }

  async preflight(input: BuildInput): Promise<BuildToolsPreflightResult> {
    await fs.mkdir(this.buildRoot, { recursive: true });
    const requiredMajor = requiredBuildJava(input.minecraftVersion);
    const runtime = input.javaRuntimeId
      ? await javaRuntimeRegistry.getRuntime(input.javaRuntimeId)
      : await javaRuntimeRegistry.getBestRuntime(requiredMajor);
    let javaMajor: number | null = null;
    const javaExecutable: string | null = runtime?.executablePath ?? null;
    let javaValid = false;
    if (javaExecutable) {
      const info = await javaRuntimeValidator.validateExecutable(javaExecutable).catch(() => null);
      javaMajor = info?.major ?? null;
      javaValid = Boolean(info && info.major >= requiredMajor);
    }

    const hasJdk = Boolean(
      javaExecutable &&
        (await fs.stat(javaCompilerPath(javaExecutable)).then((stat) => stat.isFile()).catch(() => false))
    );
    const bundledGit = await portableGitService.getCached();
    const systemGit = await portableGitService.findSystemGit();
    const git = bundledGit ?? systemGit;
    const space = await fs
      .statfs(this.buildRoot)
      .then((stats) => Number(stats.bavail) * Number(stats.bsize))
      .catch(() => null);
    const activeJob = await prisma.softwareBuildJob.findFirst({
      where: {
        provider: "spigot",
        minecraftVersion: input.minecraftVersion,
        buildId: input.minecraftVersion,
        status: { in: [...ACTIVE_STATUSES] },
      },
      select: { id: true },
    });

    const checks: BuildToolsPreflightResult["checks"] = [
      {
        id: "java",
        status: javaValid ? "passed" : "failed",
        message: javaValid
          ? `Java ${javaMajor} is compatible with this BuildTools revision.`
          : `Java ${requiredMajor} or newer is required for BuildTools.`,
      },
      {
        id: "jdk",
        status: hasJdk ? "passed" : "failed",
        message: hasJdk ? "A Java compiler was found." : "BuildTools requires a JDK with javac.",
      },
      {
        id: "git",
        status: git ? "passed" : "warning",
        message: git
          ? git.source === "bundled" ? "Bundled MinGit is ready." : "System Git is available."
          : "Bundled MinGit will be downloaded automatically before the build.",
      },
      {
        id: "disk",
        status: space !== null && space >= REQUIRED_DISK_BYTES ? "passed" : "failed",
        message:
          space === null
            ? "Available disk space could not be checked."
            : `${Math.round(space / 1024 / 1024)} MB is available for the build.`,
      },
      {
        id: "active-job",
        status: activeJob ? "warning" : "passed",
        message: activeJob ? "A build for this revision is already running." : "No duplicate build is running.",
      },
    ];

    return {
      ready: checks.every((check) => check.status !== "failed") && !activeJob,
      javaRuntimeId: runtime?.id ?? null,
      javaMajor,
      javaExecutable,
      hasJdk,
      gitAvailable: Boolean(git),
      gitPath: git?.gitPath ?? null,
      gitSource: git?.source ?? null,
      diskSpaceBytes: space,
      requiredDiskSpaceBytes: REQUIRED_DISK_BYTES,
      offline: false,
      activeJobId: activeJob?.id ?? null,
      checks,
    };
  }

  async start(input: BuildInput & { requestId?: string }): Promise<{
    job: SoftwareBuildJob;
    artifact: SoftwareArtifact | null;
    cached: boolean;
  }> {
    if (input.provider !== "spigot") throw new Error("Only Spigot BuildTools jobs are supported");
    const cached = await softwareCacheService.findValidArtifact("spigot", input.minecraftVersion, input.minecraftVersion);
    const existing = await prisma.softwareBuildJob.findFirst({
      where: {
        provider: "spigot",
        minecraftVersion: input.minecraftVersion,
        buildId: input.minecraftVersion,
        status: { in: [...ACTIVE_STATUSES] },
      },
    });
    if (existing) return { job: toJob(existing), artifact: null, cached: false };

    const id = input.requestId ?? crypto.randomUUID();
    const created = await prisma.softwareBuildJob.create({
      data: {
        id,
        provider: "spigot",
        minecraftVersion: input.minecraftVersion,
        buildId: input.minecraftVersion,
        status: cached ? "completed" : "queued",
        stage: cached ? "done" : "checking-prerequisites",
        bytesReceived: cached ? cached.sizeBytes : 0,
        totalBytes: cached ? cached.sizeBytes : null,
        percent: cached ? 100 : null,
        artifactPath: cached?.cachedPath ?? null,
        completedAt: cached ? new Date() : null,
      },
    });
    if (cached) {
      this.emit(toJob(created));
      return { job: toJob(created), artifact: cached, cached: true };
    }

    this.emit(toJob(created));
    void this.run(id, input).catch((error) => logger.error({ error, buildId: id }, "Spigot BuildTools job failed"));
    return { job: toJob(created), artifact: null, cached: false };
  }

  async getJob(id: string): Promise<SoftwareBuildJob | null> {
    const record = await prisma.softwareBuildJob.findUnique({ where: { id } });
    return record ? toJob(record) : null;
  }

  async getLog(id: string): Promise<{ content: string; truncated: boolean } | null> {
    const record = await prisma.softwareBuildJob.findUnique({
      where: { id },
      select: { logPath: true },
    });
    if (!record) return null;
    if (!record.logPath) return { content: "", truncated: false };

    const buildRoot = path.resolve(this.buildRoot);
    const logPath = path.resolve(record.logPath);
    const relative = path.relative(buildRoot, logPath);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("Build log path is outside the BuildTools workspace");
    }

    const content = await fs.readFile(logPath, "utf8");
    const maxBytes = 1024 * 1024;
    return {
      content: content.length > maxBytes ? content.slice(-maxBytes) : content,
      truncated: content.length > maxBytes,
    };
  }

  async cancel(id: string): Promise<SoftwareBuildJob> {
    const current = await prisma.softwareBuildJob.findUnique({ where: { id } });
    if (!current) throw new Error("Software build job not found");
    if (![...ACTIVE_STATUSES].includes(current.status as (typeof ACTIVE_STATUSES)[number])) {
      return toJob(current);
    }
    const active = this.active.get(id);
    if (active) {
      active.cancelled = true;
      if (active.child?.pid) {
        await new Promise<void>((resolve) => treeKill(active.child!.pid!, "SIGTERM", () => resolve()));
      }
      await fs.rm(active.workspacePath, { recursive: true, force: true }).catch(() => {});
    }
    const record = await prisma.softwareBuildJob.update({
      where: { id },
      data: { status: "cancelled", stage: "cancelled", error: "BuildTools build cancelled." },
    });
    const job = toJob(record);
    this.emit(job, undefined, "BuildTools build cancelled.");
    return job;
  }

  async retry(id: string, input: BuildInput): Promise<{ job: SoftwareBuildJob; artifact: SoftwareArtifact | null; cached: boolean }> {
    const existing = await prisma.softwareBuildJob.findUnique({ where: { id } });
    if (!existing) throw new Error("Software build job not found");
    if ([...ACTIVE_STATUSES].includes(existing.status as (typeof ACTIVE_STATUSES)[number])) {
      await this.cancel(id);
    }
    return this.start({ ...input, requestId: crypto.randomUUID() });
  }

  async getBuildToolsStatus(): Promise<{
    cached: boolean;
    buildNumber: string | null;
    version: string | null;
    sizeBytes: number | null;
    sha256: string | null;
    downloadedAt: string | null;
  }> {
    const cached = await this.readCachedTool();
    if (!cached) return { cached: false, buildNumber: null, version: null, sizeBytes: null, sha256: null, downloadedAt: null };
    return {
      cached: true,
      buildNumber: cached.metadata.buildNumber,
      version: cached.metadata.version,
      sizeBytes: cached.sizeBytes,
      sha256: cached.metadata.sha256,
      downloadedAt: cached.metadata.downloadedAt,
    };
  }

  async refreshBuildTools(): Promise<void> {
    await fs.rm(this.buildToolsRoot, { recursive: true, force: true });
  }

  private async run(id: string, input: BuildInput): Promise<void> {
    const workspacePath = path.join(this.buildRoot, id, "workspace");
    this.active.set(id, { cancelled: false, workspacePath });
    try {
      await this.updateJob(id, { status: "preflight", stage: "checking-prerequisites", percent: null });
      const preflight = await this.preflight(input);
      if (!preflight.ready) throw new Error(preflight.checks.filter((check) => check.status === "failed").map((check) => check.message).join(" "));
      if (!preflight.javaExecutable) throw new Error("No Java executable is available for BuildTools");

      const gitEnvironment = await this.ensureGit(id);
      const release = await this.resolveToolRelease();
      const toolPath = await this.ensureTool(id, release);
      await this.updateJob(id, { status: "preparing-workspace", stage: "preparing-workspace", workspacePath, logPath: path.join(this.buildRoot, id, "build.log") });
      await fs.mkdir(workspacePath, { recursive: true });
      const logPath = path.join(this.buildRoot, id, "build.log");
      await fs.writeFile(logPath, "", "utf8");
      await this.runBuildProcess(id, input, preflight.javaExecutable, toolPath, workspacePath, logPath, gitEnvironment);
      await this.updateJob(id, { status: "validating", stage: "locating-artifact", percent: null });
      const outputPath = await this.findArtifact(workspacePath, input.minecraftVersion);
      await this.validateJar(outputPath);
      await this.updateJob(id, { stage: "verifying-artifact" });
      const sha256 = await this.fileSha256(outputPath);
      const stat = await fs.stat(outputPath);
      const finalPath = softwareCacheService.getArtifactPath("spigot", input.minecraftVersion, input.minecraftVersion);
      const stagingPath = softwareCacheService.getTmpPath(id);
      await fs.mkdir(path.dirname(finalPath), { recursive: true });
      await fs.copyFile(outputPath, stagingPath);
      await fs.rm(finalPath, { force: true });
      await fs.rename(stagingPath, finalPath);
      await this.updateJob(id, { stage: "caching-artifact", artifactPath: finalPath });
      const artifact = await softwareCacheService.upsertArtifact({
        provider: "spigot",
        minecraftVersion: input.minecraftVersion,
        buildId: input.minecraftVersion,
        filename: "server.jar",
        sizeBytes: stat.size,
        sha256,
        cachedPath: finalPath,
        acquisition: "build",
        buildTool: "spigot-buildtools",
        buildToolVersion: release.version,
        sourceMetadataJson: JSON.stringify({ buildNumber: release.buildNumber, url: release.downloadUrl }),
        buildLogPath: logPath,
      });
      const completed = await this.updateJob(id, { status: "completed", stage: "done", percent: 100, completedAt: new Date() });
      this.emit(completed);
      logger.info({ id, version: input.minecraftVersion, sha256, sizeBytes: stat.size }, "Spigot artifact built");
      void artifact;
    } catch (error) {
      const cancelled = this.active.get(id)?.cancelled === true;
      const message = error instanceof Error ? error.message : "BuildTools build failed";
      if (!cancelled) {
        void errorService.record(errorService.createFromUnknown(error, {
          category: "download",
          severity: "error",
          userMessage: "Spigot could not be built with BuildTools.",
          possibleSolution: "Open the build log, verify Java/Git, and retry the build.",
          source: "backend:software-buildtools",
          action: "build-spigot",
          recoveries: ["retry", "open-java-center", "copy-details", "dismiss"],
        }));
      }
      const failed = await this.updateJob(id, {
        status: cancelled ? "cancelled" : "failed",
        stage: cancelled ? "cancelled" : "failed",
        error: cancelled ? "BuildTools build cancelled." : message,
      });
      this.emit(failed, undefined, message);
    } finally {
      this.active.delete(id);
      await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async resolveToolRelease(): Promise<BuildToolsRelease> {
    try {
      return await buildToolsProvider.resolveLatest();
    } catch (error) {
      const cached = await this.readCachedTool();
      if (cached) return cached.metadata;
      throw error;
    }
  }

  private async ensureTool(id: string, release: BuildToolsRelease): Promise<string> {
    const cached = await this.readCachedTool(release.buildNumber);
    if (cached) return cached.path;
    await this.updateJob(id, { status: "downloading-tool", stage: "downloading-buildtools", bytesReceived: 0, totalBytes: null, percent: 0 });
    const directory = path.join(this.buildToolsRoot, release.buildNumber);
    const filePath = path.join(directory, "BuildTools.jar");
    const tmpPath = `${filePath}.part`;
    await fs.mkdir(directory, { recursive: true });
    const result = await this.downloadTool(id, release.downloadUrl, tmpPath);
    const sha256 = await this.fileSha256(tmpPath);
    await fs.rename(tmpPath, filePath);
    await fs.writeFile(path.join(directory, "metadata.json"), JSON.stringify({
      ...release,
      sha256,
      sizeBytes: result,
      downloadedAt: new Date().toISOString(),
    }, null, 2), "utf8");
    return filePath;
  }

  private async ensureGit(id: string): Promise<PortableGitEnvironment> {
    try {
      return await portableGitService.ensure(async (progress) => {
        await this.updateJob(id, {
          status: "preparing-workspace",
          stage: "preparing-workspace",
          bytesReceived: progress.bytesReceived,
          totalBytes: progress.totalBytes,
          percent: progress.percent,
        });
      });
    } catch (error) {
      const system = await portableGitService.findSystemGit();
      if (system) return system;
      throw error;
    }
  }

  private async readCachedTool(buildNumber?: string): Promise<{ path: string; sizeBytes: number; metadata: BuildToolsRelease & { sha256: string; sizeBytes: number; downloadedAt: string } } | null> {
    const directories = buildNumber ? [buildNumber] : await fs.readdir(this.buildToolsRoot).catch(() => []);
    for (const directory of directories.sort().reverse()) {
      const base = path.join(this.buildToolsRoot, directory);
      const metadata = JSON.parse(await fs.readFile(path.join(base, "metadata.json"), "utf8").catch(() => "null")) as (BuildToolsRelease & { sha256: string; sizeBytes: number; downloadedAt: string }) | null;
      if (!metadata) continue;
      const filePath = path.join(base, "BuildTools.jar");
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat?.isFile() || stat.size !== metadata.sizeBytes || (await this.fileSha256(filePath)) !== metadata.sha256) continue;
      return { path: filePath, sizeBytes: stat.size, metadata };
    }
    return null;
  }

  private async downloadTool(id: string, url: string, tmpPath: string): Promise<number> {
    let current = buildToolsProvider.validateDownloadUrl(url).toString();
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": "ServerLab MC BuildTools", Accept: "application/java-archive" },
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("BuildTools download redirect did not include a location");
      current = buildToolsProvider.validateDownloadUrl(new URL(location, current).toString()).toString();
    }
    if (!response || !response.ok || !response.body) throw new Error(`BuildTools download failed (${response?.status ?? "no response"})`);
    const total = Number(response.headers.get("content-length")) || null;
    const output = await fs.open(tmpPath, "w");
    const reader = response.body.getReader();
    let bytes = 0;
    let lastEmit = 0;
    try {
      for (let next = await reader.read(); !next.done; next = await reader.read()) {
        await output.write(next.value);
        bytes += next.value.byteLength;
        const now = Date.now();
        if (now - lastEmit > 250) {
          lastEmit = now;
          await this.updateJob(id, { bytesReceived: bytes, totalBytes: total, percent: total ? (bytes / total) * 100 : null });
        }
      }
    } finally {
      await output.close();
    }
    return bytes;
  }

  private async runBuildProcess(id: string, input: BuildInput, javaExecutable: string, toolPath: string, workspacePath: string, logPath: string, gitEnvironment: PortableGitEnvironment): Promise<void> {
    await this.updateJob(id, { status: "building", stage: "running-buildtools", pid: null, percent: null });
    const logOutput = async (chunk: Buffer) => {
      const line = safeLogLine(chunk.toString(), workspacePath);
      await fs.appendFile(logPath, line, "utf8").catch(() => {});
      const job = await this.getJob(id);
      if (job) this.emit(job, line);
    };
    const { child, completion } = buildToolsProcessRunner.launch({
      javaExecutable,
      toolPath,
      revision: input.minecraftVersion,
      workspacePath,
      env: {
        ...process.env,
        PATH: [...gitEnvironment.pathEntries, process.env.PATH ?? ""].filter(Boolean).join(path.delimiter),
      },
      onOutput: (chunk) => void logOutput(chunk),
    });
    const active = this.active.get(id);
    if (active) active.child = child;
    await this.updateJob(id, { pid: child.pid ?? null });
    await completion;
  }

  private async findArtifact(workspacePath: string, version: string): Promise<string> {
    const expected = `spigot-${version}.jar`.toLowerCase();
    const queue = [workspacePath];
    while (queue.length) {
      const current = queue.shift()!;
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(full);
        } else if (entry.isFile() && entry.name.toLowerCase() === expected) {
          return full;
        }
      }
    }
    throw new Error(`BuildTools did not produce ${expected}`);
  }

  private async validateJar(filePath: string): Promise<void> {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size < 4) throw new Error("BuildTools produced an empty server jar");
    const handle = await fs.open(filePath, "r");
    const header = Buffer.alloc(4);
    try {
      await handle.read(header, 0, 4, 0);
    } finally {
      await handle.close();
    }
    if (header[0] !== 0x50 || header[1] !== 0x4b) throw new Error("BuildTools output is not a valid jar archive");
  }

  private async fileSha256(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    const content = await fs.readFile(filePath);
    return hash.update(content).digest("hex");
  }

  private async updateJob(id: string, data: Record<string, unknown>): Promise<SoftwareBuildJob> {
    const record = await prisma.softwareBuildJob.update({ where: { id }, data });
    const job = toJob(record);
    this.emit(job);
    return job;
  }

  private emit(job: SoftwareBuildJob, currentLogLine?: string, error?: string): void {
    const payload: SoftwareBuildProgressPayload = {
      jobId: job.id,
      provider: job.provider,
      minecraftVersion: job.minecraftVersion,
      buildId: job.buildId,
      status: job.status,
      stage: job.stage,
      bytesReceived: job.bytesReceived,
      totalBytes: job.totalBytes,
      percent: job.percent,
      currentLogLine,
      logAvailable: Boolean(job.logPath),
      error: error ?? job.error ?? undefined,
    };
    getSoftwareSocketServer()?.emit("software:build-progress", payload);
  }
}

export const spigotBuildService = new SpigotBuildService();
