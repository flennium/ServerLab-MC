import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

export async function ensureDatabaseSchema(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "servers" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "path" TEXT NOT NULL,
      "version" TEXT NOT NULL,
      "software" TEXT NOT NULL,
      "kind" TEXT NOT NULL DEFAULT 'server',
      "softwareBuildId" TEXT,
      "targetMinecraftVersion" TEXT,
      "bindAddress" TEXT NOT NULL DEFAULT '0.0.0.0',
      "configurationState" TEXT NOT NULL DEFAULT 'ready',
      "javaPath" TEXT NOT NULL,
      "ramMinMb" INTEGER NOT NULL DEFAULT 1024,
      "ramMaxMb" INTEGER NOT NULL DEFAULT 4096,
      "port" INTEGER NOT NULL DEFAULT 25565,
      "startupArgs" TEXT,
      "autoStart" BOOLEAN NOT NULL DEFAULT false,
      "status" TEXT NOT NULL DEFAULT 'stopped',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "templates" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "repositoryUrl" TEXT NOT NULL,
      "version" TEXT,
      "author" TEXT,
      "official" BOOLEAN NOT NULL DEFAULT false,
      "installedAt" DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS "backups" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "serverId" TEXT NOT NULL,
      "location" TEXT NOT NULL,
      "sizeBytes" INTEGER NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'manual',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "backups_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "java_versions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "major" INTEGER NOT NULL,
      "path" TEXT NOT NULL,
      "vendor" TEXT,
      "detected" BOOLEAN NOT NULL DEFAULT true
    )`,
    `CREATE TABLE IF NOT EXISTS "java_runtimes" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT,
      "distribution" TEXT NOT NULL,
      "major" INTEGER NOT NULL,
      "version" TEXT NOT NULL,
      "os" TEXT NOT NULL,
      "arch" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "path" TEXT NOT NULL,
      "executablePath" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'valid',
      "checksum" TEXT,
      "detectedAt" DATETIME,
      "installedAt" DATETIME,
      "lastValidatedAt" DATETIME,
      "lastUsedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "java_runtimes_executablePath_key"
      ON "java_runtimes"("executablePath")`,
    `CREATE TABLE IF NOT EXISTS "java_install_jobs" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "major" INTEGER NOT NULL,
      "version" TEXT,
      "status" TEXT NOT NULL DEFAULT 'queued',
      "stage" TEXT NOT NULL DEFAULT 'resolving-provider',
      "bytesReceived" INTEGER NOT NULL DEFAULT 0,
      "totalBytes" INTEGER,
      "speedBytesPerSec" INTEGER NOT NULL DEFAULT 0,
      "etaSeconds" INTEGER,
      "error" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "software_artifacts" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "minecraftVersion" TEXT NOT NULL,
      "buildId" TEXT NOT NULL,
      "acquisition" TEXT NOT NULL DEFAULT 'download',
      "buildTool" TEXT,
      "buildToolVersion" TEXT,
      "sourceMetadataJson" TEXT,
      "buildLogPath" TEXT,
      "filename" TEXT NOT NULL,
      "sizeBytes" INTEGER NOT NULL DEFAULT 0,
      "sha256" TEXT,
      "cachedPath" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'cached',
      "downloadedAt" DATETIME,
      "lastUsedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "software_artifacts_provider_minecraftVersion_buildId_key"
      ON "software_artifacts"("provider", "minecraftVersion", "buildId")`,
    `CREATE TABLE IF NOT EXISTS "software_build_jobs" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "minecraftVersion" TEXT NOT NULL,
      "buildId" TEXT NOT NULL,
      "toolVersion" TEXT,
      "status" TEXT NOT NULL DEFAULT 'queued',
      "stage" TEXT NOT NULL DEFAULT 'checking-prerequisites',
      "bytesReceived" INTEGER NOT NULL DEFAULT 0,
      "totalBytes" INTEGER,
      "percent" REAL,
      "pid" INTEGER,
      "workspacePath" TEXT,
      "logPath" TEXT,
      "artifactPath" TEXT,
      "error" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      "completedAt" DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS "software_downloads" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "provider" TEXT NOT NULL,
      "minecraftVersion" TEXT NOT NULL,
      "buildId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'queued',
      "bytesReceived" INTEGER NOT NULL DEFAULT 0,
      "totalBytes" INTEGER,
      "speedBytesPerSec" INTEGER NOT NULL DEFAULT 0,
      "etaSeconds" INTEGER,
      "stage" TEXT NOT NULL DEFAULT 'resolving-provider',
      "error" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "error_events" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "category" TEXT NOT NULL,
      "severity" TEXT NOT NULL,
      "userMessage" TEXT NOT NULL,
      "technicalDetails" TEXT,
      "possibleSolution" TEXT,
      "action" TEXT NOT NULL,
      "source" TEXT NOT NULL,
      "recoveriesJson" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "clearedAt" DATETIME
    )`,
    `CREATE TABLE IF NOT EXISTS "plugins" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "serverId" TEXT NOT NULL,
      "source" TEXT NOT NULL DEFAULT 'modrinth',
      "contentType" TEXT NOT NULL DEFAULT 'plugin',
      "sourceProjectId" TEXT,
      "sourceVersionId" TEXT,
      "slug" TEXT,
      "name" TEXT NOT NULL,
      "installedVersion" TEXT NOT NULL,
      "fileName" TEXT NOT NULL,
      "filePath" TEXT NOT NULL,
      "fileHashSha1" TEXT,
      "fileHashSha512" TEXT,
      "fileSizeBytes" INTEGER,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "status" TEXT NOT NULL DEFAULT 'installed',
      "updateAvailable" BOOLEAN NOT NULL DEFAULT false,
      "installedAt" DATETIME,
      "lastCheckedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "plugins_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "plugins_serverId_source_sourceProjectId_key"
      ON "plugins"("serverId", "source", "sourceProjectId")`,
    `CREATE TABLE IF NOT EXISTS "plugin_dependencies" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "pluginId" TEXT NOT NULL,
      "dependsOnProjectId" TEXT NOT NULL,
      "dependsOnVersionId" TEXT,
      "dependsOnName" TEXT,
      "dependencyType" TEXT NOT NULL,
      "resolvedPluginId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "plugin_dependencies_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "plugins" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "plugin_install_jobs" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "serverId" TEXT NOT NULL,
      "pluginId" TEXT,
      "projectId" TEXT,
      "versionId" TEXT,
      "action" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'queued',
      "stage" TEXT NOT NULL DEFAULT 'resolving-project',
      "bytesReceived" INTEGER NOT NULL DEFAULT 0,
      "totalBytes" INTEGER,
      "speedBytesPerSec" INTEGER NOT NULL DEFAULT 0,
      "etaSeconds" INTEGER,
      "error" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "plugin_install_jobs_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "plugin_install_jobs_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "plugins" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "modrinth_cache_entries" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "kind" TEXT NOT NULL,
      "payloadJson" TEXT NOT NULL,
      "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" DATETIME NOT NULL
    )`,
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  await ensureColumn("servers", "javaRuntimeId", '"javaRuntimeId" TEXT');
  await ensureColumn("servers", "javaOverrideMode", '"javaOverrideMode" TEXT NOT NULL DEFAULT \'automatic\'');
  await ensureColumn(
    "servers",
    "allowUnsupportedJava",
    '"allowUnsupportedJava" BOOLEAN NOT NULL DEFAULT false'
  );
  await ensureColumn("servers", "kind", '"kind" TEXT NOT NULL DEFAULT \'server\'');
  await ensureColumn("servers", "softwareBuildId", '"softwareBuildId" TEXT');
  await ensureColumn("servers", "targetMinecraftVersion", '"targetMinecraftVersion" TEXT');
  await ensureColumn("servers", "bindAddress", '"bindAddress" TEXT NOT NULL DEFAULT \'0.0.0.0\'');
  await ensureColumn("servers", "configurationState", '"configurationState" TEXT NOT NULL DEFAULT \'ready\'');
  await ensureColumn("software_artifacts", "acquisition", '"acquisition" TEXT NOT NULL DEFAULT \'download\'');
  await ensureColumn("software_artifacts", "buildTool", '"buildTool" TEXT');
  await ensureColumn("software_artifacts", "buildToolVersion", '"buildToolVersion" TEXT');
  await ensureColumn("software_artifacts", "sourceMetadataJson", '"sourceMetadataJson" TEXT');
  await ensureColumn("software_artifacts", "buildLogPath", '"buildLogPath" TEXT');
  await migrateLegacyJavaRows();

  logger.info("Database schema ready");
}

async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${table}")`);
  if (rows.some((row) => row.name === column)) return;
  await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN ${definition}`);
}

async function migrateLegacyJavaRows(): Promise<void> {
  const legacy = await prisma.$queryRawUnsafe<
    Array<{ id: string; major: number; path: string; vendor: string | null; detected: boolean }>
  >(`SELECT id, major, path, vendor, detected FROM "java_versions"`);

  for (const row of legacy) {
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "java_runtimes"
       ("id", "provider", "distribution", "major", "version", "os", "arch", "source", "path", "executablePath", "status", "checksum", "detectedAt", "installedAt", "lastValidatedAt", "lastUsedAt", "createdAt", "updatedAt")
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', NULL, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      row.id,
      row.vendor ?? "Java",
      row.major,
      String(row.major),
      process.platform,
      process.arch,
      row.detected ? "system" : "manual",
      row.path === "java" ? "PATH" : row.path,
      row.path
    );
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "servers"
     SET "javaRuntimeId" = (
       SELECT "id" FROM "java_runtimes" WHERE "java_runtimes"."executablePath" = "servers"."javaPath" LIMIT 1
     )
     WHERE "javaRuntimeId" IS NULL
       AND EXISTS (
         SELECT 1 FROM "java_runtimes" WHERE "java_runtimes"."executablePath" = "servers"."javaPath"
       )`
  );
}
