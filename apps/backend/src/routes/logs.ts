import fs from "fs/promises";
import path from "path";
import { Router } from "express";

export const logRoutes = Router();

const TOKEN_PATTERN = /(bearer\s+)[a-z0-9._~+/=-]+/gi;

function redact(value: string): string {
  return value.replace(TOKEN_PATTERN, "$1[redacted]");
}

logRoutes.get("/export", async (_req, res, next) => {
  try {
    const root = path.join(process.env.DATA_DIR ?? process.cwd(), "logs");
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
        .slice(0, 10)
        .map(async (entry) => {
          const filePath = path.join(root, entry.name);
          const content = await fs.readFile(filePath, "utf8").catch(() => "");
          return {
            name: entry.name,
            content: redact(content.slice(-120_000)),
          };
        })
    );
    res.json({ exportedAt: new Date().toISOString(), files });
  } catch (err) {
    next(err);
  }
});
