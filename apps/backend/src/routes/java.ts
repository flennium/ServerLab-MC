import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { execFile } from "child_process";
import { promisify } from "util";

export const javaRoutes = Router();
const execFileAsync = promisify(execFile);

// GET /api/java
javaRoutes.get("/", async (_req, res, next) => {
  try {
    const versions = await prisma.javaVersion.findMany({
      orderBy: { major: "asc" },
    });
    res.json({ versions });
  } catch (err) {
    next(err);
  }
});

// POST /api/java/detect  — scan PATH and well-known locations, persist results
javaRoutes.post("/detect", async (_req, res, next) => {
  try {
    const candidates = await detectJavaInstallations();
    // Upsert each detected JDK
    for (const candidate of candidates) {
      await prisma.javaVersion.upsert({
        where: { id: candidate.path }, // use path as natural key for detection
        create: {
          id: candidate.path,
          major: candidate.major,
          path: candidate.path,
          vendor: candidate.vendor ?? null,
          detected: true,
        },
        update: { major: candidate.major, vendor: candidate.vendor ?? null },
      });
    }
    const versions = await prisma.javaVersion.findMany({
      orderBy: { major: "asc" },
    });
    res.json({ versions });
  } catch (err) {
    next(err);
  }
});

// POST /api/java/install — download a JDK via Adoptium API (v2 full impl)
javaRoutes.post("/install", async (req, res, next) => {
  try {
    const { major } = req.body as { major: number };
    // TODO: call Adoptium API, download, extract, add to DB
    res.status(202).json({ message: `JDK ${major} install queued` });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface DetectedJava {
  major: number;
  path: string;
  vendor?: string;
}

async function detectJavaInstallations(): Promise<DetectedJava[]> {
  const results: DetectedJava[] = [];

  // Try the java on PATH first
  try {
    const { stdout } = await execFileAsync("java", ["-version"], {
      timeout: 5000,
    });
    const version = parseJavaVersion(stdout);
    if (version) results.push({ major: version, path: "java" });
  } catch {
    // java not on PATH — that's fine
  }

  // Well-known Windows JDK install paths
  const wellKnown = [
    "C:\\Program Files\\Eclipse Adoptium",
    "C:\\Program Files\\Java",
    "C:\\Program Files\\Microsoft",
  ];

  // This is intentionally minimal for v1 — a proper scanner will glob these
  // directories in the v2 Java Manager implementation.

  return results;
}

function parseJavaVersion(versionOutput: string): number | null {
  // Java prints version to stderr: e.g. `openjdk version "21.0.3" ...`
  const match = versionOutput.match(/version "(\d+)/);
  if (!match) return null;
  const major = parseInt(match[1], 10);
  // Old style: 1.8 → 8
  return major === 1 ? 8 : major;
}
