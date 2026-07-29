-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "software" TEXT NOT NULL,
    "javaPath" TEXT NOT NULL,
    "ramMinMb" INTEGER NOT NULL DEFAULT 1024,
    "ramMaxMb" INTEGER NOT NULL DEFAULT 4096,
    "port" INTEGER NOT NULL DEFAULT 25565,
    "startupArgs" TEXT,
    "autoStart" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'stopped',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "version" TEXT,
    "author" TEXT,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "installedAt" DATETIME
);

-- CreateTable
CREATE TABLE "backups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "backups_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "java_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "major" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "vendor" TEXT,
    "detected" BOOLEAN NOT NULL DEFAULT true
);
