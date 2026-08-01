import fs from "fs/promises";
import path from "path";
import type { FileEntry } from "@serverlab/shared";

export class FileManager {
  private readonly resolvedRoot: string;

  constructor(private readonly serverRoot: string) {
    this.resolvedRoot = path.resolve(serverRoot);
  }

  private resolve(relativePath: string): string {
    const normalized = path.normalize(relativePath);
    const absolute = path.isAbsolute(normalized)
      ? normalized
      : path.join(this.serverRoot, normalized);
    const resolved = path.resolve(absolute);
    const relative = path.relative(this.resolvedRoot, resolved);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(
        `Path traversal detected: "${relativePath}" escapes server root`
      );
    }
    return resolved;
  }

  async listDirectory(relativePath: string = ""): Promise<FileEntry[]> {
    const dir = this.resolve(relativePath);
    const entries = await fs.readdir(dir, { withFileTypes: true });

    const results = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name);
        const stat = await fs.stat(entryPath).catch(() => null);
        return {
          name: entry.name,
          path: path.relative(this.serverRoot, entryPath).replace(/\\/g, "/"),
          isDirectory: entry.isDirectory(),
          sizeBytes: stat && !entry.isDirectory() ? stat.size : null,
          modifiedAt: stat ? stat.mtime.toISOString() : new Date().toISOString(),
        } satisfies FileEntry;
      })
    );

    return results.sort((a, b) => {
      // Directories first, then files, alphabetically within each group
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async readFile(relativePath: string): Promise<string> {
    const filePath = this.resolve(relativePath);
    return fs.readFile(filePath, "utf-8");
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    const filePath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  async deleteEntry(relativePath: string): Promise<void> {
    const filePath = this.resolve(relativePath);
    await fs.rm(filePath, { recursive: true, force: true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const from = this.resolve(oldPath);
    const to = this.resolve(newPath);
    await fs.rename(from, to);
  }

  async createDirectory(relativePath: string): Promise<void> {
    const dirPath = this.resolve(relativePath);
    await fs.mkdir(dirPath, { recursive: true });
  }
}
