-- Add full admin panel support fields without changing scan/report business logic.
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "Plan" ADD COLUMN "clientManagementEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Plan" ADD COLUMN "shareLinkEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AbuseLog" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "AbuseLog" ALTER COLUMN "targetUrl" DROP NOT NULL;
ALTER TABLE "AbuseLog" ADD COLUMN "target" TEXT;
ALTER TABLE "AbuseLog" ADD COLUMN "eventType" TEXT NOT NULL DEFAULT 'SECURITY_EVENT';
ALTER TABLE "AbuseLog" ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'INFO';
ALTER TABLE "AbuseLog" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "AbuseLog" ADD COLUMN "metadata" JSONB;

ALTER TABLE "AbuseLog" DROP CONSTRAINT IF EXISTS "AbuseLog_userId_fkey";
ALTER TABLE "AbuseLog" ADD CONSTRAINT "AbuseLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AbuseLog_eventType_idx" ON "AbuseLog"("eventType");
CREATE INDEX "AbuseLog_severity_idx" ON "AbuseLog"("severity");
CREATE INDEX "AbuseLog_createdAt_idx" ON "AbuseLog"("createdAt");
