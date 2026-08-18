import fs from "fs/promises";
import path from "path";
import { inflateRawSync } from "zlib";
import type { JavaRequirementDetection } from "@serverlab/shared";

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const MAX_CENTRAL_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const MAX_CLASS_ENTRIES = 250_000;

interface ZipEntry {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

interface ClassVersionSummary {
  major: number | null;
  count: number;
  unsupportedEntries: number;
}

function emptyDetection(jarPath: string, warning: string): JavaRequirementDetection {
  return {
    requiredMajor: null,
    confidence: "unknown",
    method: "unknown",
    jarPath,
    classFileMajor: null,
    metadataMajor: null,
    indicators: [],
    warnings: [warning],
  };
}

function javaMajorFromClassFile(classFileMajor: number): number | null {
  if (!Number.isInteger(classFileMajor) || classFileMajor < 45) return null;
  // Java 8 is class-file version 52, Java 25 is version 69.
  return Math.max(8, classFileMajor - 44);
}

function parseJavaMajor(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value >= 8 ? value : null;
  if (typeof value !== "string") return null;
  const match = value.match(/(?:^|\D)(1\.)?(\d{1,2})(?:\D|$)/);
  if (!match) return null;
  const major = Number(match[2]);
  return Number.isInteger(major) && major >= 8 ? major : null;
}

function parseManifest(raw: string): { major: number | null; indicators: string[] } {
  const indicators: string[] = [];
  let major: number | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (["build-jdk-spec", "build-jdk", "created-by"].includes(key)) {
      const candidate = parseJavaMajor(value);
      if (candidate && (!major || candidate > major)) major = candidate;
      indicators.push(`${match[1].trim()}: ${value}`);
    }
  }
  return { major, indicators };
}

function findJsonJavaMajor(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    return value.reduce<number | null>((highest, item) => {
      const candidate = findJsonJavaMajor(item);
      return candidate && (!highest || candidate > highest) ? candidate : highest;
    }, null);
  }

  let highest: number | null = null;
  for (const [key, child] of Object.entries(value)) {
    if (/java(?:_|-)?(?:version|major)|requires?Java/i.test(key)) {
      const candidate = parseJavaMajor(child);
      if (candidate && (!highest || candidate > highest)) highest = candidate;
    }
    const nested = findJsonJavaMajor(child);
    if (nested && (!highest || nested > highest)) highest = nested;
  }
  return highest;
}

async function readAt(handle: fs.FileHandle, offset: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const result = await handle.read(buffer, 0, length, offset);
  return buffer.subarray(0, result.bytesRead);
}

async function readZipEntries(handle: fs.FileHandle, size: number): Promise<ZipEntry[]> {
  const tailLength = Math.min(size, 22 + 65_535);
  const tail = await readAt(handle, size - tailLength, tailLength);
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) === ZIP_EOCD_SIGNATURE) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("JAR has no ZIP end record");

  const entryCount = tail.readUInt16LE(eocd + 10);
  const centralSize = tail.readUInt32LE(eocd + 12);
  const centralOffset = tail.readUInt32LE(eocd + 16);
  if (centralSize > MAX_CENTRAL_DIRECTORY_BYTES || centralOffset + centralSize > size) {
    throw new Error("JAR central directory is invalid or too large");
  }

  const central = await readAt(handle, centralOffset, centralSize);
  const entries: ZipEntry[] = [];
  let cursor = 0;
  while (cursor + 46 <= central.length && entries.length < entryCount) {
    if (central.readUInt32LE(cursor) !== ZIP_CENTRAL_SIGNATURE) break;
    const compression = central.readUInt16LE(cursor + 10);
    const compressedSize = central.readUInt32LE(cursor + 20);
    const uncompressedSize = central.readUInt32LE(cursor + 24);
    const nameLength = central.readUInt16LE(cursor + 28);
    const extraLength = central.readUInt16LE(cursor + 30);
    const commentLength = central.readUInt16LE(cursor + 32);
    const localHeaderOffset = central.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const next = nameStart + nameLength + extraLength + commentLength;
    if (next > central.length) break;
    const name = central.subarray(nameStart, nameStart + nameLength).toString("utf8");
    entries.push({ name, compression, compressedSize, uncompressedSize, localHeaderOffset });
    cursor = next;
  }
  if (entries.length === 0) throw new Error("JAR central directory is empty");
  return entries;
}

async function readZipEntry(handle: fs.FileHandle, entry: ZipEntry, maxBytes: number): Promise<Buffer> {
  if (entry.uncompressedSize > maxBytes) throw new Error(`ZIP entry is larger than ${maxBytes} bytes`);
  const local = await readAt(handle, entry.localHeaderOffset, 30);
  if (local.length < 30 || local.readUInt32LE(0) !== ZIP_LOCAL_SIGNATURE) {
    throw new Error(`Invalid local ZIP header for ${entry.name}`);
  }
  const nameLength = local.readUInt16LE(26);
  const extraLength = local.readUInt16LE(28);
  const compressed = await readAt(
    handle,
    entry.localHeaderOffset + 30 + nameLength + extraLength,
    entry.compressedSize
  );
  if (compressed.length !== entry.compressedSize) throw new Error(`Truncated ZIP entry ${entry.name}`);
  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) return inflateRawSync(compressed, { maxOutputLength: maxBytes });
  throw new Error(`Unsupported ZIP compression method ${entry.compression}`);
}

async function scanClassVersions(handle: fs.FileHandle, entries: ZipEntry[]): Promise<ClassVersionSummary> {
  let highest: number | null = null;
  let count = 0;
  let unsupportedEntries = 0;
  for (const entry of entries) {
    if (!entry.name.endsWith(".class") || entry.name.endsWith("/module-info.class")) continue;
    count += 1;
    if (count > MAX_CLASS_ENTRIES) {
      unsupportedEntries += 1;
      continue;
    }
    try {
      const bytes = await readZipEntry(handle, entry, 4 * 1024 * 1024);
      if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0xcafebabe) {
        unsupportedEntries += 1;
        continue;
      }
      const major = bytes.readUInt16BE(6);
      if (highest === null || major > highest) highest = major;
    } catch {
      unsupportedEntries += 1;
    }
  }
  return { major: highest, count, unsupportedEntries };
}

export class JavaRequirementDetectionService {
  async detect(jarPath: string): Promise<JavaRequirementDetection> {
    const resolvedPath = path.resolve(jarPath);
    const handle = await fs.open(resolvedPath, "r").catch(() => null);
    if (!handle) return emptyDetection(resolvedPath, "The server JAR could not be opened for Java detection.");

    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 4) {
        return emptyDetection(resolvedPath, "The server JAR is missing or empty.");
      }

      const entries = await readZipEntries(handle, stat.size);
      const byName = new Map(entries.map((entry) => [entry.name, entry]));
      const indicators: string[] = [];
      const warnings: string[] = [];
      let metadataMajor: number | null = null;

      const manifestEntry = byName.get("META-INF/MANIFEST.MF");
      if (manifestEntry) {
        try {
          const manifest = parseManifest((await readZipEntry(handle, manifestEntry, MAX_METADATA_BYTES)).toString("utf8"));
          metadataMajor = manifest.major;
          indicators.push(...manifest.indicators);
        } catch (error) {
          warnings.push(`Manifest metadata could not be read: ${error instanceof Error ? error.message : "invalid entry"}`);
        }
      }

      for (const name of ["fabric.mod.json", "version.json", "META-INF/version.json"]) {
        const entry = byName.get(name);
        if (!entry) continue;
        try {
          const json = JSON.parse((await readZipEntry(handle, entry, MAX_METADATA_BYTES)).toString("utf8"));
          const candidate = findJsonJavaMajor(json);
          if (candidate && (!metadataMajor || candidate > metadataMajor)) metadataMajor = candidate;
          if (candidate) indicators.push(`${name} declares Java ${candidate}`);
        } catch {
          warnings.push(`${name} is present but could not be parsed.`);
        }
      }

      const classes = await scanClassVersions(handle, entries);
      const classMajor = classes.major;
      const classJavaMajor = classMajor === null ? null : javaMajorFromClassFile(classMajor);
      if (classMajor !== null) {
        indicators.push(`Scanned ${classes.count} class files; highest class-file version is ${classMajor} (Java ${classJavaMajor}).`);
      }
      if (classes.unsupportedEntries > 0) {
        warnings.push(`${classes.unsupportedEntries} class entries could not be inspected.`);
      }

      if (classJavaMajor !== null) {
        return {
          requiredMajor: classJavaMajor,
          confidence: classes.unsupportedEntries > 0 ? "medium" : "high",
          method: "class-file",
          jarPath: resolvedPath,
          classFileMajor: classMajor,
          metadataMajor,
          indicators,
          warnings,
        };
      }

      if (metadataMajor !== null) {
        return {
          requiredMajor: metadataMajor,
          confidence: "medium",
          method: manifestEntry ? "manifest" : "bootstrap-metadata",
          jarPath: resolvedPath,
          classFileMajor: null,
          metadataMajor,
          indicators,
          warnings: [...warnings, "Class files were not available; Java was read from JAR metadata."],
        };
      }

      return {
        requiredMajor: null,
        confidence: "low",
        method: "ambiguous",
        jarPath: resolvedPath,
        classFileMajor: null,
        metadataMajor: null,
        indicators,
        warnings: [...warnings, "The JAR did not expose a reliable Java requirement."],
      };
    } catch (error) {
      return emptyDetection(
        resolvedPath,
        `The JAR could not be inspected safely: ${error instanceof Error ? error.message : "invalid archive"}`
      );
    } finally {
      await handle.close().catch(() => {});
    }
  }
}

export const javaRequirementDetectionService = new JavaRequirementDetectionService();
