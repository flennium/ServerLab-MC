ALTER TABLE "software_artifacts" ADD COLUMN "acquisition" TEXT NOT NULL DEFAULT 'download';
ALTER TABLE "software_artifacts" ADD COLUMN "buildTool" TEXT;
ALTER TABLE "software_artifacts" ADD COLUMN "buildToolVersion" TEXT;
ALTER TABLE "software_artifacts" ADD COLUMN "sourceMetadataJson" TEXT;
ALTER TABLE "software_artifacts" ADD COLUMN "buildLogPath" TEXT;

CREATE TABLE "software_build_jobs" (
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
);
