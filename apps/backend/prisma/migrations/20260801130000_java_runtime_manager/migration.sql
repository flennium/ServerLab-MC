ALTER TABLE "servers" ADD COLUMN "javaRuntimeId" TEXT;
ALTER TABLE "servers" ADD COLUMN "javaOverrideMode" TEXT NOT NULL DEFAULT 'automatic';
ALTER TABLE "servers" ADD COLUMN "allowUnsupportedJava" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "java_runtimes" (
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
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "java_runtimes_executablePath_key" UNIQUE ("executablePath")
);

CREATE TABLE "java_install_jobs" (
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
);
