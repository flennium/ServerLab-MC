ALTER TABLE "servers" ADD COLUMN "javaRequirementMajor" INTEGER;
ALTER TABLE "servers" ADD COLUMN "javaRequirementConfidence" TEXT;
ALTER TABLE "servers" ADD COLUMN "javaRequirementMethod" TEXT;
ALTER TABLE "servers" ADD COLUMN "javaRequirementDetails" TEXT;
ALTER TABLE "servers" ADD COLUMN "javaRequirementDetectedAt" DATETIME;
