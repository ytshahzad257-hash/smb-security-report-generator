-- Add Lemon Squeezy provider support without removing existing manual or Stripe fields.

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'LEMON';
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'LEMON';

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "lemonCustomerId" TEXT;

ALTER TABLE "Plan"
ADD COLUMN IF NOT EXISTS "lemonVariantId" TEXT,
ADD COLUMN IF NOT EXISTS "lemonProductId" TEXT,
ADD COLUMN IF NOT EXISTS "lemonEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Subscription"
ADD COLUMN IF NOT EXISTS "lemonSubscriptionId" TEXT,
ADD COLUMN IF NOT EXISTS "lemonCustomerId" TEXT;

ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "lemonOrderId" TEXT,
ADD COLUMN IF NOT EXISTS "lemonCheckoutId" TEXT,
ADD COLUMN IF NOT EXISTS "lemonSubscriptionId" TEXT,
ADD COLUMN IF NOT EXISTS "lemonCustomerId" TEXT,
ADD COLUMN IF NOT EXISTS "lemonVariantId" TEXT,
ADD COLUMN IF NOT EXISTS "lemonProductId" TEXT,
ADD COLUMN IF NOT EXISTS "providerEventId" TEXT;

CREATE TABLE IF NOT EXISTS "LemonSqueezyEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "processingStatus" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LemonSqueezyEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_lemonCustomerId_key" ON "User"("lemonCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_lemonSubscriptionId_key" ON "Subscription"("lemonSubscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_providerEventId_key" ON "Payment"("providerEventId");
CREATE UNIQUE INDEX IF NOT EXISTS "LemonSqueezyEvent_eventId_key" ON "LemonSqueezyEvent"("eventId");

CREATE INDEX IF NOT EXISTS "Subscription_lemonCustomerId_idx" ON "Subscription"("lemonCustomerId");
CREATE INDEX IF NOT EXISTS "Payment_lemonSubscriptionId_idx" ON "Payment"("lemonSubscriptionId");
CREATE INDEX IF NOT EXISTS "Payment_lemonCustomerId_idx" ON "Payment"("lemonCustomerId");
CREATE INDEX IF NOT EXISTS "Payment_lemonOrderId_idx" ON "Payment"("lemonOrderId");
CREATE INDEX IF NOT EXISTS "LemonSqueezyEvent_eventName_idx" ON "LemonSqueezyEvent"("eventName");
CREATE INDEX IF NOT EXISTS "LemonSqueezyEvent_processingStatus_idx" ON "LemonSqueezyEvent"("processingStatus");
CREATE INDEX IF NOT EXISTS "LemonSqueezyEvent_createdAt_idx" ON "LemonSqueezyEvent"("createdAt");
