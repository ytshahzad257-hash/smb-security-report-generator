ALTER TABLE "AgencyProfile"
  ADD COLUMN "logoPath" TEXT,
  ADD COLUMN "primaryColor" TEXT NOT NULL DEFAULT '#0f172a',
  ADD COLUMN "secondaryColor" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "websiteUrl" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "showPoweredBy" BOOLEAN NOT NULL DEFAULT true;

UPDATE "AgencyProfile"
SET
  "primaryColor" = COALESCE(NULLIF("brandColor", ''), "primaryColor"),
  "websiteUrl" = COALESCE(NULLIF("website", ''), "websiteUrl"),
  "footerText" = COALESCE(NULLIF("footerText", ''), 'Prepared for client review');

ALTER TABLE "AgencyProfile"
  ALTER COLUMN "footerText" SET DEFAULT 'Prepared for client review',
  ALTER COLUMN "footerText" SET NOT NULL;
