-- Add Stripe billing metadata and webhook idempotency without removing manual payment flows.
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'STRIPE');

ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;

ALTER TABLE "Plan" ADD COLUMN "stripeProductId" TEXT;
ALTER TABLE "Plan" ADD COLUMN "stripePriceId" TEXT;
ALTER TABLE "Plan" ADD COLUMN "stripeMode" TEXT;
ALTER TABLE "Plan" ADD COLUMN "isStripeEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CreditPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reportCredits" INTEGER NOT NULL,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "isStripeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPackage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Subscription" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Subscription" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Payment" ALTER COLUMN "planId" DROP NOT NULL;
ALTER TABLE "Payment" ADD COLUMN "creditPackageId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "packageName" TEXT;
ALTER TABLE "Payment" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Payment" ADD COLUMN "reportCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "stripeCheckoutSessionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripePaymentIntentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripeInvoiceId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripeSubscriptionId" TEXT;

CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processingStatus" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "CreditPackage_slug_key" ON "CreditPackage"("slug");
CREATE INDEX "CreditPackage_isActive_idx" ON "CreditPackage"("isActive");
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "Payment_stripeInvoiceId_key" ON "Payment"("stripeInvoiceId");
CREATE INDEX "Payment_planId_idx" ON "Payment"("planId");
CREATE INDEX "Payment_creditPackageId_idx" ON "Payment"("creditPackageId");
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");
CREATE INDEX "Payment_stripeSubscriptionId_idx" ON "Payment"("stripeSubscriptionId");
CREATE UNIQUE INDEX "StripeEvent_stripeEventId_key" ON "StripeEvent"("stripeEventId");
CREATE INDEX "StripeEvent_eventType_idx" ON "StripeEvent"("eventType");
CREATE INDEX "StripeEvent_processingStatus_idx" ON "StripeEvent"("processingStatus");
CREATE INDEX "StripeEvent_createdAt_idx" ON "StripeEvent"("createdAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_creditPackageId_fkey" FOREIGN KEY ("creditPackageId") REFERENCES "CreditPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Plan" SET "stripeMode" = 'payment' WHERE "billingType" = 'ONE_TIME';
UPDATE "Plan" SET "stripeMode" = 'subscription' WHERE "billingType" = 'MONTHLY';
UPDATE "Payment" AS p
SET "packageName" = plan."name",
    "reportCredits" = plan."reportCredits"
FROM "Plan" AS plan
WHERE p."planId" = plan."id";

INSERT INTO "CreditPackage" (
    "id",
    "name",
    "slug",
    "price",
    "currency",
    "reportCredits",
    "updatedAt"
) VALUES
    ('credit-package-credits-5', '5 PDF Credits', 'credits-5', 45.00, 'USD', 5, CURRENT_TIMESTAMP),
    ('credit-package-credits-10', '10 PDF Credits', 'credits-10', 85.00, 'USD', 10, CURRENT_TIMESTAMP),
    ('credit-package-credits-25', '25 PDF Credits', 'credits-25', 199.00, 'USD', 25, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
