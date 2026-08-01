import fs from "fs/promises";
import path from "path";
import { javaRuntimeRegistry } from "./JavaRuntimeRegistry.js";
import { javaRuntimePaths } from "./JavaRuntimePaths.js";
import {
  javaExecutableName,
  javaRuntimeValidator,
  type JavaVersionInfo,
} from "./JavaRuntimeValidator.js";
import { runtimeArch, runtimeOs } from "./JavaRuntimeProviders.js";
import type { JavaRuntime } from "@serverlab/shared";

interface Candidate {
  executablePath: string;
  source: "system" | "managed";
}

export class JavaDetectionService {
  async detect(): Promise<JavaRuntime[]> {
    await javaRuntimeRegistry.ensureDirectories();
    const candidates = await this.collectCandidates();
    const seen = new Set<string>();
    const runtimes: JavaRuntime[] = [];

    for (const candidate of candidates) {
      const key = candidate.executablePath.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const info = await javaRuntimeValidator.validateExecutable(candidate.executablePath).catch(() => null);
      if (!info) continue;
      runtimes.push(await this.registerCandidate(candidate, info));
    }

    return javaRuntimeRegistry.listRuntimes();
  }

  private async registerCandidate(candidate: Candidate, info: JavaVersionInfo): Promise<JavaRuntime> {
    const executablePath =
      candidate.executablePath === "java" ? "java" : path.resolve(candidate.executablePath);
    const runtimePath =
      executablePath === "java" ? "PATH" : path.resolve(executablePath, "..", "..");
    return javaRuntimeRegistry.upsertRuntime({
      provider: candidate.source === "managed" ? "adoptium" : null,
      distribution: info.distribution,
      major: info.major,
      version: info.version,
      os: runtimeOs(),
      arch: runtimeArch(),
      source: candidate.source,
      path: runtimePath,
      executablePath,
      status: "valid",
    });
  }

  private async collectCandidates(): Promise<Candidate[]> {
    const candidates: Candidate[] = [{ executablePath: "java", source: "system" }];
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
      candidates.push({
        executablePath: path.join(javaHome, "bin", javaExecutableName()),
        source: "system",
      });
    }

    candidates.push(...(await this.scanCommonFolders()));
    candidates.push(...(await this.scanManagedFolders()));
    return candidates;
  }

  private async scanCommonFolders(): Promise<Candidate[]> {
    if (process.platform !== "win32") return [];
    const roots = [
      "C:\\Program Files\\Eclipse Adoptium",
      "C:\\Program Files\\Java",
      "C:\\Program Files\\Microsoft",
    ];
    const candidates: Candidate[] = [];
    for (const root of roots) {
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        candidates.push({
          executablePath: path.join(root, entry.name, "bin", javaExecutableName()),
          source: "system",
        });
      }
    }
    return candidates;
  }

  private async scanManagedFolders(): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const queue = [javaRuntimePaths.managedRoot];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
        } else if (
          entry.isFile() &&
          entry.name.toLowerCase() === javaExecutableName().toLowerCase() &&
          fullPath.toLowerCase().includes(`${path.sep}bin${path.sep}`)
        ) {
          candidates.push({ executablePath: fullPath, source: "managed" });
        }
      }
    }
    return candidates;
  }
}

export const javaDetectionService = new JavaDetectionService();
