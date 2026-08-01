import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { JavaRuntime } from "@serverlab/shared";
import { javaRuntimeRegistry } from "./JavaRuntimeRegistry.js";

const execFileAsync = promisify(execFile);

export interface JavaVersionInfo {
  major: number;
  version: string;
  distribution: string;
}

export function javaExecutableName(): string {
  return process.platform === "win32" ? "java.exe" : "java";
}

export function parseJavaVersionOutput(output: string): JavaVersionInfo | null {
  const versionMatch = output.match(/version\s+"([^"]+)"/i) ?? output.match(/openjdk\s+([^"\s]+)/i);
  const raw = versionMatch?.[1];
  if (!raw) return null;
  const first = raw.split(".")[0];
  const second = raw.split(".")[1];
  const major = first === "1" && second ? Number(second) : Number(first);
  if (!Number.isFinite(major)) return null;

  const distribution =
    output.match(/Temurin/i)
      ? "Temurin"
      : output.match(/Microsoft/i)
        ? "Microsoft OpenJDK"
        : output.match(/Oracle/i)
          ? "Oracle"
          : output.match(/OpenJDK/i)
            ? "OpenJDK"
            : "Java";

  return { major, version: raw, distribution };
}

export class JavaRuntimeValidator {
  async readVersion(executablePath: string): Promise<JavaVersionInfo> {
    const executable = executablePath === "java" ? executablePath : path.resolve(executablePath);
    const { stdout, stderr } = await execFileAsync(executable, ["-version"], {
      timeout: 7000,
      windowsHide: true,
    });
    const info = parseJavaVersionOutput(`${stdout}\n${stderr}`);
    if (!info) throw new Error("Could not parse Java runtime version");
    return info;
  }

  async validateExecutable(executablePath: string): Promise<JavaVersionInfo> {
    if (executablePath !== "java") {
      const stat = await fs.stat(executablePath).catch(() => null);
      if (!stat?.isFile()) throw new Error("Java executable is missing");
    }
    return this.readVersion(executablePath);
  }

  async validateRuntime(runtime: JavaRuntime): Promise<JavaRuntime> {
    try {
      const info = await this.validateExecutable(runtime.executablePath);
      const status = info.major === runtime.major ? "valid" : "unsupported";
      const updated = await javaRuntimeRegistry.upsertRuntime({
        provider: runtime.provider,
        distribution: runtime.distribution || info.distribution,
        major: info.major,
        version: info.version,
        os: runtime.os,
        arch: runtime.arch,
        source: runtime.source,
        path: runtime.path,
        executablePath: runtime.executablePath,
        status,
        checksum: runtime.checksum,
      });
      return updated;
    } catch {
      const status = runtime.source === "managed" ? "corrupted" : "missing";
      return (await javaRuntimeRegistry.markStatus(runtime.id, status)) ?? runtime;
    }
  }

  async findExecutable(root: string): Promise<string> {
    const target = javaExecutableName().toLowerCase();
    const queue = [root];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isFile() && entry.name.toLowerCase() === target && fullPath.toLowerCase().includes(`${path.sep}bin${path.sep}`)) {
          return fullPath;
        }
        if (entry.isDirectory() && queue.length < 500) queue.push(fullPath);
      }
    }
    throw new Error("Installed archive did not contain a Java executable");
  }
}

export const javaRuntimeValidator = new JavaRuntimeValidator();
