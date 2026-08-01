CREATE TABLE "software_artifacts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "minecraftVersion" TEXT NOT NULL,
  "buildId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  "sha256" TEXT,
  "cachedPath" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'cached',
  "downloadedAt" DATETIME,
  "lastUsedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "software_artifacts_provider_minecraftVersion_buildId_key"
ON "software_artifacts"("provider", "minecraftVersion", "buildId");

CREATE TABLE "software_downloads" (
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
);
