-- Add local PDF report generation state without removing existing report fields.
CREATE TYPE "ReportStatus" AS ENUM ('GENERATED', 'FAILED');

ALTER TABLE "Report"
ADD COLUMN "status" "ReportStatus" NOT NULL DEFAULT 'GENERATED',
ADD COLUMN "filePath" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
