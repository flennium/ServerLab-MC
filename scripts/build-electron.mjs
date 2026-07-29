/**
 * Bundles Electron main + preload with esbuild.
 *
 * Why esbuild instead of tsc?
 *   tsc produces CommonJS but leaves all require() calls unresolved —
 *   so electron-updater, semver, etc. must exist in node_modules at runtime.
 *   esbuild inlines them into the bundle, so the asar has zero dependencies.
 *
 * Only `electron` is external — it's provided by the Electron runtime itself.
 */

import { build } from "esbuild";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const ELECTRON_SRC = path.join(ROOT, "apps/electron/src");
const OUT = path.join(ROOT, "apps/electron/dist");

// Clean
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const sharedAlias = {
  "@serverlab/shared": path.join(ROOT, "packages/shared/src/index.ts"),
};

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["electron"],
  sourcemap: true,
  minify: false,
  alias: sharedAlias,
};

console.log("⚙  Bundling Electron main + preload…");

await Promise.all([
  build({
    ...common,
    entryPoints: [path.join(ELECTRON_SRC, "main.ts")],
    outfile: path.join(OUT, "main.js"),
  }),
  build({
    ...common,
    entryPoints: [path.join(ELECTRON_SRC, "preload.ts")],
    outfile: path.join(OUT, "preload.js"),
    // Preload runs in a sandboxed renderer context — contextBridge is from electron
    external: ["electron"],
  }),
]);

console.log("  ✓ main.js");
console.log("  ✓ preload.js");
console.log("Done.");
