CREATE TABLE IF NOT EXISTS "error_events" (
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
);
