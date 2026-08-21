/**
 * Bundles Electron main + preload with esbuild.
 *
 * Why esbuild instead of tsc?
 *   tsc produces CommonJS but leaves all require() calls unresolved,
 *   so electron-updater, semver, etc. must exist in node_modules at runtime.
 *   esbuild inlines them into the bundle, so the asar has zero dependencies.
 *
 * Only `electron` is external because it is provided by the Electron runtime.
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
  // Production packages exclude maps; opt in locally when debugging bundled code.
  sourcemap: process.env.SOURCEMAP === "1",
  minify: false,
  alias: sharedAlias,
};

console.log("Bundling Electron main + preload...");

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
    // The sandboxed preload gets contextBridge from Electron at runtime.
    external: ["electron"],
  }),
]);

console.log("  OK main.js");
console.log("  OK preload.js");
console.log("Done.");
