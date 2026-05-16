-- Add email notification preferences and safe delivery logs.

CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "UserNotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "paymentEmails" BOOLEAN NOT NULL DEFAULT true,
  "scanEmails" BOOLEAN NOT NULL DEFAULT true,
  "reportEmails" BOOLEAN NOT NULL DEFAULT true,
  "shareEmails" BOOLEAN NOT NULL DEFAULT true,
  "marketingEmails" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "toEmail" TEXT NOT NULL,
  "templateKey" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" "EmailStatus" NOT NULL,
  "errorMessage" TEXT,
  "providerMessageId" TEXT,
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNotificationPreference_userId_key" ON "UserNotificationPreference"("userId");
CREATE UNIQUE INDEX "EmailLog_dedupeKey_key" ON "EmailLog"("dedupeKey");
CREATE INDEX "EmailLog_userId_idx" ON "EmailLog"("userId");
CREATE INDEX "EmailLog_templateKey_idx" ON "EmailLog"("templateKey");
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

ALTER TABLE "UserNotificationPreference"
ADD CONSTRAINT "UserNotificationPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailLog"
ADD CONSTRAINT "EmailLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
