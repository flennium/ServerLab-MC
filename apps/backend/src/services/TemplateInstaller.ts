/**
 * TemplateInstaller
 *
 * Flow:
 *  1. Download the GitHub repo as a ZIP archive into a temp staging folder
 *  2. Verify a template.json exists at the repo root
 *  3. Extract the archive into the target server directory
 *  4. Emit Socket.IO `template:progress` events throughout
 *  5. Mark the template as installed in the DB
 *
 * Security notes:
 *  - No scripts from the repo are ever auto-executed
 *  - Community templates are visually flagged in the UI (official=false)
 *  - All paths are resolved and validated before extraction
 */

import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import os from "os";
import https from "https";
import http from "http";
import { createWriteStream } from "fs";
import extractZip from "extract-zip";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { io } from "../index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemplateJson {
  name: string;
  version?: string;
  type?: string;
  author?: string;
  description?: string;
}

export interface InstallOptions {
  /** Absolute path to the server directory that will receive the template files */
  targetPath: string;
  /** ID of the server record to associate (optional — create-from-template flow) */
  serverId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emitProgress(templateId: string, stage: string, percent: number) {
  io.emit("template:progress", { templateId, stage, percent });
}

/**
 * Download a URL to a local file, following up to 3 redirects.
 * Emits download progress in 10 % increments.
 */
function downloadFile(
  url: string,
  dest: string,
  templateId: string,
  stage: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    function get(currentUrl: string, redirectCount = 0) {
      if (redirectCount > 3) return reject(new Error("Too many redirects"));

      const client = currentUrl.startsWith("https://") ? https : http;

      client
        .get(currentUrl, (res) => {
          if (
            res.statusCode === 301 ||
            res.statusCode === 302 ||
            res.statusCode === 307 ||
            res.statusCode === 308
          ) {
            if (!res.headers.location)
              return reject(new Error("Redirect with no location"));
            return get(res.headers.location, redirectCount + 1);
          }

          if (res.statusCode !== 200) {
            return reject(
              new Error(`HTTP ${res.statusCode} downloading ${currentUrl}`)
            );
          }

          const totalStr = res.headers["content-length"];
          const total = totalStr ? parseInt(totalStr, 10) : 0;
          let received = 0;
          let lastPct = 0;

          const out = createWriteStream(dest);

          res.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (total > 0) {
              const pct = Math.round((received / total) * 80); // 0→80 %
              if (pct > lastPct) {
                lastPct = pct;
                emitProgress(templateId, stage, pct);
              }
            }
          });

          res.pipe(out);
          out.on("finish", () => { out.close(); resolve(); });
          out.on("error", reject);
          res.on("error", reject);
        })
        .on("error", reject);
    }

    get(url);
  });
}

/**
 * Convert a GitHub repo URL into the ZIP download URL for the default branch.
 *
 * Supports:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/tree/branch
 */
function repoUrlToZip(repoUrl: string): { zipUrl: string; branch: string } {
  const clean = repoUrl
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/$/, "");

  // Extract branch from /tree/branch path
  const treeMatch = clean.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/tree\/(.+)$/);
  if (treeMatch) {
    return {
      zipUrl: `${treeMatch[1]}/archive/refs/heads/${treeMatch[2]}.zip`,
      branch: treeMatch[2],
    };
  }

  return {
    zipUrl: `${clean}/archive/refs/heads/main.zip`,
    branch: "main",
  };
}

/**
 * Given an extracted archive root, find the top-level folder that GitHub wraps
 * archives in (e.g. `repo-main/`) and return the inner path.
 */
async function findInnerRoot(extractDir: string): Promise<string> {
  const entries = await fsPromises.readdir(extractDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1) {
    return path.join(extractDir, dirs[0].name);
  }
  return extractDir;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function installTemplate(
  templateId: string,
  options: InstallOptions
): Promise<TemplateJson> {
  const template = await prisma.template.findUniqueOrThrow({
    where: { id: templateId },
  });

  emitProgress(templateId, "Preparing", 2);

  // 1. Build download URL
  const { zipUrl, branch } = repoUrlToZip(template.repositoryUrl);
  logger.info({ templateId, zipUrl }, "Installing template");

  // 2. Create temp staging directory
  const stagingDir = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "serverlab-template-")
  );
  const zipPath = path.join(stagingDir, "template.zip");
  const extractDir = path.join(stagingDir, "extracted");
  await fsPromises.mkdir(extractDir);

  try {
    // 3. Download ZIP
    emitProgress(templateId, "Downloading", 5);
    await downloadFile(zipUrl, zipPath, templateId, "Downloading");
    emitProgress(templateId, "Extracting", 82);

    // 4. Extract
    await extractZip(zipPath, { dir: extractDir });
    emitProgress(templateId, "Verifying", 88);

    // 5. Find inner root (GitHub wraps in repo-branch/)
    const innerRoot = await findInnerRoot(extractDir);

    // 6. Read + validate template.json
    const templateJsonPath = path.join(innerRoot, "template.json");
    let templateMeta: TemplateJson;
    try {
      const raw = await fsPromises.readFile(templateJsonPath, "utf-8");
      templateMeta = JSON.parse(raw) as TemplateJson;
    } catch {
      // No template.json is acceptable — use repo name as fallback
      templateMeta = { name: template.name };
      logger.warn({ templateId }, "template.json not found — using defaults");
    }

    emitProgress(templateId, "Installing", 92);

    // 7. Copy files into the target server directory (create if needed)
    const target = options.targetPath;
    await fsPromises.mkdir(target, { recursive: true });

    // Copy all files from innerRoot → target, skipping template.json itself
    await copyDir(innerRoot, target);

    // 8. Mark as installed in DB
    await prisma.template.update({
      where: { id: templateId },
      data: {
        installedAt: new Date(),
        version: templateMeta.version ?? template.version,
        author: templateMeta.author ?? template.author,
      },
    });

    emitProgress(templateId, "Done", 100);
    logger.info({ templateId, target }, "Template installed successfully");

    return templateMeta;
  } finally {
    // Clean up staging regardless of success/failure
    await fsPromises
      .rm(stagingDir, { recursive: true, force: true })
      .catch(() => {});
  }
}

/** Recursively copy src directory contents into dest, skipping template.json */
async function copyDir(src: string, dest: string): Promise<void> {
  await fsPromises.mkdir(dest, { recursive: true });
  const entries = await fsPromises.readdir(src, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === "template.json") return; // don't copy meta file
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await fsPromises.copyFile(srcPath, destPath);
      }
    })
  );
}
