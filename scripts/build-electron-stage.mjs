/**
 * Stages the Electron app for packaging.
 *
 * electron-builder expects:
 *   stage/
 *     main.js          compiled Electron main
 *     preload.js       compiled preload
 *     package.json     with "main": "main.js"
 *
 * Everything else (renderer, backend) goes into extraResources
 * and is accessible at process.resourcesPath at runtime.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const ELECTRON_DIST = path.join(ROOT, "apps/electron/dist");
const STAGE = path.join(ROOT, "stage");

// Clean and recreate stage dir
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

// Copy compiled electron main + preload (.js files only, not nested dirs)
for (const file of fs.readdirSync(ELECTRON_DIST)) {
  const srcPath = path.join(ELECTRON_DIST, file);
  const stat = fs.statSync(srcPath);
  // Only copy files directly in dist/ (main.js, preload.js, *.map)
  if (stat.isFile()) {
    fs.copyFileSync(srcPath, path.join(STAGE, file));
  }
}

// Write a minimal package.json that electron-builder reads from the stage dir
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const stagePkg = {
  name: rootPkg.name,
  version: rootPkg.version,
  description: rootPkg.description,
  author: "ServerLab MC",
  main: "main.js",
};
fs.writeFileSync(
  path.join(STAGE, "package.json"),
  JSON.stringify(stagePkg, null, 2)
);

console.log("OK Electron stage ready at", STAGE);
console.log("  Files:", fs.readdirSync(STAGE).join(", "));
