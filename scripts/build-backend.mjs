/**
 * Bundles the backend into a single CommonJS file using esbuild.
 *
 * Prisma is tricky because:
 *  1. It uses a native .node binary (query engine) — must be external
 *  2. It loads schema.prisma at runtime via __dirname — must be copied
 *
 * Strategy:
 *  - Bundle all JS/TS into dist/index.js (externalize only @prisma/client
 *    and the native bindings so they're loaded from node_modules at runtime)
 *  - electron-builder then copies node_modules and prisma files as extraResources
 */

import { build } from "esbuild";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const BACKEND = path.join(ROOT, "apps/backend");
const OUT = path.join(BACKEND, "dist");

console.log("⚙  Bundling backend with esbuild…");

// Clean output dir
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: [path.join(BACKEND, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: path.join(OUT, "index.js"),
  // Prisma client and native modules must stay external — they load
  // platform-specific .node files that esbuild cannot bundle
  external: [
    "@prisma/client",
    "prisma",
    // Native addons
    "*.node",
    // systeminformation has native bindings on some platforms
    "systeminformation",
  ],
  // Don't inline node_modules for these — they'll be in extraResources
  packages: "bundle",
  sourcemap: true,
  minify: false, // keep readable for debugging
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  // Required for __dirname usage in the bundled output
  banner: {
    js: `
const __require = require;
`,
  },
});

// Copy prisma schema so Prisma can find it at runtime
const prismaDir = path.join(OUT, "prisma");
fs.mkdirSync(prismaDir, { recursive: true });
fs.copyFileSync(
  path.join(BACKEND, "prisma/schema.prisma"),
  path.join(prismaDir, "schema.prisma")
);

// Copy migrations so prisma migrate deploy works on first launch
const migrationsDir = path.join(BACKEND, "prisma/migrations");
if (fs.existsSync(migrationsDir)) {
  fs.cpSync(migrationsDir, path.join(prismaDir, "migrations"), { recursive: true });
  console.log("  ✓ Copied prisma migrations");
}

console.log("  ✓ Backend bundled →", path.join(OUT, "index.js"));
console.log("  ✓ Prisma schema copied →", path.join(prismaDir, "schema.prisma"));
console.log("Done.");
