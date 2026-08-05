CREATE TABLE "plugins" (
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
);

CREATE UNIQUE INDEX "plugins_serverId_source_sourceProjectId_key"
  ON "plugins"("serverId", "source", "sourceProjectId");

CREATE TABLE "plugin_dependencies" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "pluginId" TEXT NOT NULL,
  "dependsOnProjectId" TEXT NOT NULL,
  "dependsOnVersionId" TEXT,
  "dependsOnName" TEXT,
  "dependencyType" TEXT NOT NULL,
  "resolvedPluginId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plugin_dependencies_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "plugins" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "plugin_install_jobs" (
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
);

CREATE TABLE "modrinth_cache_entries" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "cachedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL
);
