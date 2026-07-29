/**
 * electron-builder configuration
 * Run: npm run package
 */
/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "dev.serverlab.mc",
  productName: "ServerLab MC",
  copyright: "Copyright © 2025",

  directories: {
    output: "release",
    buildResources: "build-resources",
  },

  files: [
    // Electron main + preload
    "apps/electron/dist/**",
    // Renderer static assets
    "apps/renderer/dist/**",
    // Backend compiled
    "apps/backend/dist/**",
    "apps/backend/prisma/schema.prisma",
    // Root package manifest
    "package.json",
    "node_modules/**",
    // Exclude dev/test artifacts
    "!**/*.map",
    "!**/node_modules/.cache/**",
  ],

  extraResources: [
    {
      from: "apps/backend",
      to: "backend",
      filter: ["dist/**", "prisma/**", "package.json"],
    },
  ],

  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    icon: "build-resources/icon.ico",
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "ServerLab MC",
  },

  publish: {
    provider: "github",
    releaseType: "release",
  },
};
