import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(filePath) {
  return readFile(filePath, "utf8");
}

test("admin plans page uses organized sectioned editor UI", async () => {
  const page = await source("src/app/dashboard/admin/plans/page.tsx");
  const editor = await source("src/components/admin/plan-editor-card.tsx");

  assert.match(page, /PlanEditorCard/);
  assert.match(editor, /Pricing/);
  assert.match(editor, /Scan &amp; PDF Limits/);
  assert.match(editor, /Manual Review/);
  assert.match(editor, /Feature Access/);
  assert.match(editor, /Payment Provider IDs/);
  assert.match(editor, /Save plan/);
});

test("admin plan save enforces server-side validation and non-negative constraints", async () => {
  const helper = await source("src/lib/admin-plan-update.ts");

  assert.match(helper, /Plan name is required/);
  assert.match(helper, /Currency is required/);
  assert.match(helper, /billingTypeSchema/);
  assert.match(helper, /min\(0, "Price must be 0 or greater\./);
  assert.match(helper, /min\(0, "Basic scans per day must be 0 or greater\./);
  assert.match(helper, /min\(0, "Professional scans per day must be 0 or greater\./);
  assert.match(helper, /min\(0, "Basic PDF credits must be 0 or greater\./);
  assert.match(helper, /min\(0, "Professional PDF credits must be 0 or greater\./);
  assert.match(helper, /min\(0, "Total report credits must be 0 or greater\./);
});

test("admin plan save normalizes disabled entitlement credits/limits to zero", async () => {
  const helper = await source("src/lib/admin-plan-update.ts");

  assert.match(helper, /allowBasicScan[\s\S]*basicScanLimitPerDay = 0/);
  assert.match(helper, /allowProfessionalScan[\s\S]*professionalScanLimitPerDay = 0/);
  assert.match(helper, /allowBasicPdf[\s\S]*basicPdfCredits = 0/);
  assert.match(helper, /allowProfessionalPdf[\s\S]*professionalPdfCredits = 0/);
  assert.match(helper, /allowManualReview[\s\S]*lightManualReviewCredits = 0/);
  assert.match(helper, /allowManualReview[\s\S]*deepManualReviewCredits = 0/);
});

test("admin plan update remains admin-only and writes PLAN_UPDATED audit logs", async () => {
  const action = await source("src/app/actions/admin.ts");
  const route = await source("src/app/api/admin/plans/[id]/route.ts");

  assert.match(action, /requireAdminUser/);
  assert.match(action, /assertAdminWriteRateLimit/);
  assert.match(action, /action:\s*"PLAN_UPDATED"/);
  assert.match(route, /requireAdminApi/);
  assert.match(route, /enforceAdminWriteRateLimit/);
  assert.match(route, /action:\s*"PLAN_UPDATED"/);
});

test("plan update audit metadata includes changed fields and before\/after snapshots", async () => {
  const helper = await source("src/lib/admin-plan-update.ts");

  assert.match(helper, /changedFields/);
  assert.match(helper, /before/);
  assert.match(helper, /after/);
  assert.match(helper, /timestamp/);
});

test("legacy plan fields remain synced from entitlement fields", async () => {
  const helper = await source("src/lib/admin-plan-update.ts");

  assert.match(helper, /reportCredits:\s*input\.totalReportCredits/);
  assert.match(helper, /whiteLabelEnabled:\s*input\.allowWhiteLabel/);
  assert.match(helper, /clientManagementEnabled:\s*input\.allowClientManagement/);
  assert.match(helper, /shareLinkEnabled:\s*input\.allowShareLinks/);
  assert.match(helper, /manualReviewEnabled:\s*input\.allowManualReview/);
  assert.match(helper, /isStripeEnabled:\s*input\.stripeEnabled/);
});

test("admin plans UI does not expose Stripe or Lemon secret keys", async () => {
  const editor = await source("src/components/admin/plan-editor-card.tsx");

  assert.doesNotMatch(editor, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/i);
  assert.doesNotMatch(editor, /LEMONSQUEEZY_API_KEY|LEMONSQUEEZY_WEBHOOK_SECRET/i);
  assert.match(editor, /Stripe product ID/);
  assert.match(editor, /Stripe price ID/);
  assert.match(editor, /Lemon product ID/);
  assert.match(editor, /Lemon variant ID/);
});
