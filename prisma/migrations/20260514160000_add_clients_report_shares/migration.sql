-- Add client management and secure report sharing tables.

ALTER TABLE "Scan"
ADD COLUMN "clientId" TEXT,
ADD COLUMN "clientName" TEXT;

ALTER TABLE "Report"
ADD COLUMN "clientId" TEXT;

CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "companyName" TEXT,
  "contactEmail" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportShare" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "clientId" TEXT,
  "token" TEXT NOT NULL,
  "title" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "passwordHash" TEXT,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "lastViewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportShare_token_key" ON "ReportShare"("token");
CREATE INDEX "Client_userId_idx" ON "Client"("userId");
CREATE INDEX "Client_userId_name_idx" ON "Client"("userId", "name");
CREATE INDEX "Scan_clientId_idx" ON "Scan"("clientId");
CREATE INDEX "Report_clientId_idx" ON "Report"("clientId");
CREATE INDEX "ReportShare_userId_idx" ON "ReportShare"("userId");
CREATE INDEX "ReportShare_reportId_idx" ON "ReportShare"("reportId");
CREATE INDEX "ReportShare_clientId_idx" ON "ReportShare"("clientId");
CREATE INDEX "ReportShare_isActive_idx" ON "ReportShare"("isActive");

ALTER TABLE "Client"
ADD CONSTRAINT "Client_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Scan"
ADD CONSTRAINT "Scan_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Report"
ADD CONSTRAINT "Report_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReportShare"
ADD CONSTRAINT "ReportShare_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportShare"
ADD CONSTRAINT "ReportShare_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportShare"
ADD CONSTRAINT "ReportShare_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
