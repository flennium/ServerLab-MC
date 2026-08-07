import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import archiver from "archiver";
import type {
  FileContentResponse,
  FileEntry,
  FileSearchResponse,
  WriteFileDto,
} from "@serverlab/shared";
import type { Response } from "express";

const MEDIUM_FILE_BYTES = 1024 * 1024;
const LARGE_FILE_BYTES = 5 * 1024 * 1024;
const PREVIEW_BYTES = 256 * 1024;
const MAX_SEARCH_VISITS = 5000;

export class FileConflictError extends Error {
  constructor() {
    super("This file changed on disk after it was opened.");
  }
}

export class FileManager {
  private readonly resolvedRoot: string;

  constructor(private readonly serverRoot: string) {
    this.resolvedRoot = path.resolve(serverRoot);
  }

  private resolve(relativePath: string): string {
    const normalized = path.normalize(relativePath || "");
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

  async listDirectory(relativePath = ""): Promise<FileEntry[]> {
    const dir = this.resolve(relativePath);
    const normalizedRelative = relativePath.toLowerCase().replace(/\\/g, "/");
    const entries = (await fs.readdir(dir, { withFileTypes: true })).filter((entry) => {
      if (normalizedRelative !== "plugins") return true;
      return ![".staging", ".disabled", ".trash", ".backups"].includes(entry.name.toLowerCase());
    });

    const results = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name);
        const stat = await fs.stat(entryPath).catch(() => null);
        return this.toEntry(entryPath, entry.name, entry.isDirectory(), stat);
      })
    );

    return results.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async search(query: string, relativePath = "", limit = 200): Promise<FileSearchResponse> {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) {
      return { entries: [], total: 0, truncated: false };
    }

    const cappedLimit = Math.max(1, Math.min(limit, 500));
    const root = this.resolve(relativePath);
    const queue = [root];
    const entries: FileEntry[] = [];
    let total = 0;
    let visited = 0;
    let truncated = false;

    while (queue.length > 0 && visited < MAX_SEARCH_VISITS) {
      const dir = queue.shift()!;
      visited += 1;
      const children = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      const relativeDir = path.relative(this.serverRoot, dir).replace(/\\/g, "/").toLowerCase();

      for (const child of children) {
        if (this.isHiddenFromFileBrowser(relativeDir, child.name)) continue;
        const absolutePath = path.join(dir, child.name);
        const stat = await fs.stat(absolutePath).catch(() => null);
        const entry = this.toEntry(absolutePath, child.name, child.isDirectory(), stat);

        if (entry.name.toLowerCase().includes(needle) || entry.path.toLowerCase().includes(needle)) {
          total += 1;
          if (entries.length < cappedLimit) entries.push(entry);
        }

        if (child.isDirectory()) queue.push(absolutePath);
      }
    }

    truncated = queue.length > 0 || visited >= MAX_SEARCH_VISITS || total > entries.length;
    return {
      entries: entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.path.localeCompare(b.path);
      }),
      total,
      truncated,
    };
  }

  async readFile(relativePath: string): Promise<string> {
    const content = await this.readFileContent(relativePath);
    return content.content;
  }

  async readFileContent(relativePath: string): Promise<FileContentResponse> {
    const filePath = this.resolve(relativePath);
    const stat = await fs.stat(filePath);
    const binary = await isBinaryFile(filePath);
    const isLarge = stat.size > LARGE_FILE_BYTES;
    const readonly = binary || isLarge || isLogFile(relativePath);
    const bytesToRead = isLarge ? PREVIEW_BYTES : stat.size;
    const buffer = binary ? Buffer.alloc(0) : await readFirstBytes(filePath, bytesToRead);
    const content = binary ? "" : buffer.toString("utf-8");

    return {
      path: relativePath,
      content,
      encoding: binary ? "binary" : "utf-8",
      language: languageFor(relativePath),
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      etag: etagFor(stat, buffer.byteLength === stat.size ? buffer : undefined),
      readonly,
      restartHint: restartHintFor(relativePath),
      validation: validateContent(relativePath, content, binary),
      isTruncated: isLarge,
      previewBytes: isLarge ? buffer.byteLength : null,
    };
  }

  async writeFile(dto: WriteFileDto): Promise<FileContentResponse> {
    const filePath = this.resolve(dto.path);
    const currentStat = await fs.stat(filePath).catch(() => null);
    const currentEtag = currentStat ? await etagForFile(filePath, currentStat) : null;

    if (
      currentStat &&
      dto.expectedEtag &&
      dto.expectedEtag !== currentEtag &&
      !dto.force
    ) {
      throw new FileConflictError();
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, dto.content, "utf-8");
    return this.readFileContent(dto.path);
  }

  async createFile(relativePath: string, content = ""): Promise<FileContentResponse> {
    const filePath = this.resolve(relativePath);
    const exists = await fs.stat(filePath).then(() => true).catch(() => false);
    if (exists) throw new Error(`"${relativePath}" already exists`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
    return this.readFileContent(relativePath);
  }

  async deleteEntry(relativePath: string): Promise<void> {
    const filePath = this.resolve(relativePath);
    await fs.rm(filePath, { recursive: true, force: true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const from = this.resolve(oldPath);
    const to = this.resolve(newPath);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.rename(from, to);
  }

  async duplicate(relativePath: string, targetPath?: string): Promise<FileEntry> {
    const source = this.resolve(relativePath);
    const stat = await fs.stat(source);
    const destinationRelative = targetPath ?? (await this.nextCopyPath(relativePath, stat.isDirectory()));
    const destination = this.resolve(destinationRelative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: stat.isDirectory(), errorOnExist: true });
    const destStat = await fs.stat(destination);
    return this.toEntry(destination, path.basename(destination), destStat.isDirectory(), destStat);
  }

  async createDirectory(relativePath: string): Promise<FileEntry> {
    const dirPath = this.resolve(relativePath);
    await fs.mkdir(dirPath, { recursive: false });
    const stat = await fs.stat(dirPath);
    return this.toEntry(dirPath, path.basename(dirPath), true, stat);
  }

  async streamDownload(relativePath: string, res: Response): Promise<void> {
    const target = this.resolve(relativePath);
    const stat = await fs.stat(target);
    const fileName = path.basename(target);

    if (!stat.isDirectory()) {
      res.download(target, fileName);
      return;
    }

    res.attachment(`${fileName || "server-files"}.zip`);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (error) => {
      throw error;
    });
    archive.directory(target, false);
    archive.pipe(res);
    await archive.finalize();
  }

  private async nextCopyPath(relativePath: string, isDirectory: boolean): Promise<string> {
    const parsed = path.posix.parse(relativePath.replace(/\\/g, "/"));
    const baseName = isDirectory || !parsed.ext ? parsed.base : parsed.name;
    const extension = isDirectory ? "" : parsed.ext;
    const directory = parsed.dir;

    for (let index = 1; index < 1000; index += 1) {
      const name = `${baseName} copy${index === 1 ? "" : ` ${index}`}${extension}`;
      const candidate = directory ? `${directory}/${name}` : name;
      const exists = await fs.stat(this.resolve(candidate)).then(() => true).catch(() => false);
      if (!exists) return candidate;
    }

    throw new Error("Could not find an available copy name");
  }

  private toEntry(
    absolutePath: string,
    name: string,
    isDirectory: boolean,
    stat: { size: number; mtime: Date } | null
  ): FileEntry {
    const relativePath = path.relative(this.serverRoot, absolutePath).replace(/\\/g, "/");
    const extension = isDirectory ? null : extensionFor(name);
    const binary = !isDirectory && isBinaryExtension(name);
    const large = Boolean(stat && !isDirectory && stat.size > LARGE_FILE_BYTES);
    const type = typeFor(name, isDirectory, binary);
    const readonly = isDirectory ? false : binary || large || type === "log";
    return {
      name,
      path: relativePath,
      isDirectory,
      type,
      extension,
      isEditable: !isDirectory && !readonly && isEditableName(name),
      isBinary: binary,
      isLarge: large || Boolean(stat && !isDirectory && stat.size > MEDIUM_FILE_BYTES),
      readonly,
      sizeBytes: stat && !isDirectory ? stat.size : null,
      modifiedAt: stat ? stat.mtime.toISOString() : new Date().toISOString(),
    };
  }

  private isHiddenFromFileBrowser(relativeDir: string, name: string): boolean {
    if (relativeDir !== "plugins") return false;
    return [".staging", ".disabled", ".trash", ".backups"].includes(name.toLowerCase());
  }
}

async function readFirstBytes(filePath: string, bytes: number): Promise<Buffer> {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const result = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

async function isBinaryFile(filePath: string): Promise<boolean> {
  const buffer = await readFirstBytes(filePath, 4096).catch(() => Buffer.alloc(0));
  return buffer.includes(0);
}

async function etagForFile(
  filePath: string,
  stat: { size: number; mtimeMs: number }
): Promise<string> {
  if (stat.size <= LARGE_FILE_BYTES) {
    const buffer = await fs.readFile(filePath);
    return etagFor(stat, buffer);
  }
  return etagFor(stat);
}

function etagFor(stat: { size: number; mtimeMs: number }, buffer?: Buffer): string {
  const metadata = `${stat.size}-${Math.round(stat.mtimeMs)}`;
  if (!buffer) return metadata;
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  return `${metadata}-${hash}`;
}

function extensionFor(name: string): string | null {
  const extension = path.extname(name).toLowerCase();
  return extension || null;
}

function isLogFile(name: string): boolean {
  return name.toLowerCase().endsWith(".log") || name.toLowerCase().includes("/logs/");
}

function isEditableName(name: string): boolean {
  return [
    ".yml",
    ".yaml",
    ".json",
    ".properties",
    ".txt",
    ".conf",
    ".toml",
    ".ini",
    ".cfg",
    ".log",
  ].some((extension) => name.toLowerCase().endsWith(extension));
}

function isBinaryExtension(name: string): boolean {
  return [
    ".jar",
    ".zip",
    ".gz",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".dat",
    ".mca",
    ".mcr",
    ".db",
    ".sqlite",
  ].some((extension) => name.toLowerCase().endsWith(extension));
}

function typeFor(
  name: string,
  isDirectory: boolean,
  binary: boolean
): FileEntry["type"] {
  if (isDirectory) return "directory";
  if (binary) return isArchive(name) ? "archive" : "binary";
  const extension = extensionFor(name);
  if (extension === ".json") return "json";
  if (extension === ".yml" || extension === ".yaml") return "yaml";
  if (extension === ".properties") return "properties";
  if (extension === ".log") return "log";
  if ([".toml", ".conf", ".ini", ".cfg"].includes(extension ?? "")) return "config";
  if ([".txt", ".md"].includes(extension ?? "")) return "text";
  return "other";
}

function isArchive(name: string): boolean {
  return [".jar", ".zip", ".gz"].some((extension) => name.toLowerCase().endsWith(extension));
}

function languageFor(name: string): FileContentResponse["language"] {
  const extension = extensionFor(name);
  if (extension === ".json") return "json";
  if (extension === ".yml" || extension === ".yaml") return "yaml";
  if (extension === ".properties") return "properties";
  if (extension === ".js" || extension === ".ts" || extension === ".mjs") return "javascript";
  if (extension === ".log") return "log";
  if (extension === ".toml") return "toml";
  if ([".txt", ".conf", ".ini", ".cfg", ".md"].includes(extension ?? "")) return "text";
  return "unknown";
}

function restartHintFor(relativePath: string): string | null {
  const normalized = relativePath.toLowerCase().replace(/\\/g, "/");
  if (normalized === "server.properties") return "Restart the server for most server.properties changes.";
  if (normalized === "eula.txt") return "EULA changes are checked on the next server start.";
  if (["ops.json", "whitelist.json", "banned-players.json", "banned-ips.json"].includes(normalized)) {
    return "Use a server reload or restart after editing player access files.";
  }
  if (normalized.startsWith("plugins/") && /\.(ya?ml|json|toml|conf|properties)$/.test(normalized)) {
    return "Plugin configuration changes usually require a plugin reload or server restart.";
  }
  if (normalized.startsWith("world") && /\.(json|dat|properties)$/.test(normalized)) {
    return "World configuration changes are safest while the server is stopped.";
  }
  return null;
}

function validateContent(
  relativePath: string,
  content: string,
  binary: boolean
): FileContentResponse["validation"] {
  if (binary) {
    return {
      status: "warning",
      message: "Binary files cannot be previewed or edited safely in ServerLab.",
    };
  }

  const language = languageFor(relativePath);
  if (language === "json") {
    try {
      JSON.parse(content || "{}");
      return { status: "valid", message: null };
    } catch (error) {
      return {
        status: "invalid",
        message: error instanceof Error ? error.message : "Invalid JSON",
      };
    }
  }

  if (language === "properties") {
    const seen = new Set<string>();
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line || line.startsWith("#") || line.startsWith("!")) continue;
      const separatorIndex = line.search(/[:=]/);
      if (separatorIndex <= 0) {
        return {
          status: "warning",
          line: index + 1,
          message: "Properties lines should use key=value or key:value.",
        };
      }
      const key = line.slice(0, separatorIndex).trim();
      if (seen.has(key)) {
        return {
          status: "warning",
          line: index + 1,
          message: `Duplicate property "${key}". The server may only use one value.`,
        };
      }
      seen.add(key);
    }
    return { status: "valid", message: null };
  }

  if (language === "yaml") {
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^\t+/.test(line)) {
        return {
          status: "warning",
          line: index + 1,
          message: "YAML indentation should use spaces instead of tabs.",
        };
      }
      if (/^\s*[^#\s][^:]*:\s*:\s*/.test(line)) {
        return {
          status: "warning",
          line: index + 1,
          message: "This YAML line looks malformed.",
        };
      }
    }
    return { status: "unknown", message: "YAML syntax is highlighted; save carefully after plugin changes." };
  }

  return { status: "unknown", message: null };
}
