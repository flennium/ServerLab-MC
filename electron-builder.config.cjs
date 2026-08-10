/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "dev.serverlab.mc",
  productName: "ServerLab MC",
  artifactName: "ServerLab-MC-Setup-${version}.${ext}",
  copyright: "Copyright (c) 2026 ServerLab MC",

  // Stage dir is a clean folder containing only main.js, preload.js, package.json
  // This is what gets packed into the asar archive
  directories: {
    app: "stage",
    output: "release",
    buildResources: "build-resources",
  },

  // Files inside stage/ to include in the asar
  files: ["**/*", "!**/*.map"],

  // Extra files copied to resources/ dir (accessible via process.resourcesPath)
  extraResources: [
    // Renderer static assets
    {
      from: "apps/renderer/dist",
      to: "renderer",
    },
    // Backend esbuild bundle + prisma schema/migrations
    {
      from: "apps/backend/dist",
      to: "backend/dist",
    },
    // @prisma/client (has native query engine .node file)
    {
      from: "node_modules/@prisma",
      to: "backend/node_modules/@prisma",
      filter: ["**/*", "!**/*.map"],
    },
    {
      from: "node_modules/.prisma",
      to: "backend/node_modules/.prisma",
      filter: ["**/*"],
    },
    // prisma CLI (needed for migrate deploy on first launch)
    {
      from: "node_modules/prisma",
      to: "backend/node_modules/prisma",
      filter: ["**/*", "!**/*.map"],
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
    installerIcon: "build-resources/icon.ico",
    uninstallerIcon: "build-resources/icon.ico",
    license: "LICENSE",
    include: "build-resources/installer.nsh",
  },

  publish: {
    provider: "github",
    owner: "flennium",
    repo: "ServerLab-MC",
    releaseType: "release",
  },
};
