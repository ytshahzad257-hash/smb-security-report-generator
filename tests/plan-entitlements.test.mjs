import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReadablePlanSummary,
  canCreateShareLinkForEntitlements,
  canGeneratePdfForEntitlements,
  canSubmitScanForEntitlements,
  canUseManualReviewForEntitlements,
  normalizePlanEntitlements,
} from "../src/lib/billing/planEntitlements.ts";

function makePlan(overrides = {}) {
  return {
    id: "plan_1",
    name: "Test Plan",
    slug: "test-plan",
    price: "0",
    currency: "USD",
    billingType: "FREE",
    allowBasicScan: false,
    allowProfessionalScan: false,
    basicScanLimitPerDay: 0,
    professionalScanLimitPerDay: 0,
    allowBasicPdf: false,
    allowProfessionalPdf: false,
    basicPdfCredits: 0,
    professionalPdfCredits: 0,
    totalReportCredits: 0,
    allowManualReview: false,
    lightManualReviewCredits: 0,
    deepManualReviewCredits: 0,
    allowPriorityGuidance: false,
    allowWhiteLabel: false,
    allowClientManagement: false,
    allowShareLinks: false,
    allowHidePoweredBy: false,
    allowAgencyBranding: false,
    allowPrioritySupport: false,
    preferredPaymentProvider: null,
    stripeEnabled: false,
    reportCredits: 0,
    stripeProductId: null,
    stripePriceId: null,
    stripeMode: null,
    isStripeEnabled: false,
    lemonVariantId: null,
    lemonProductId: null,
    lemonEnabled: false,
    whiteLabelEnabled: false,
    clientManagementEnabled: false,
    shareLinkEnabled: false,
    manualReviewEnabled: false,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("Free Demo entitlements", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      name: "Free Demo",
      slug: "free-demo",
      billingType: "FREE",
      allowBasicScan: true,
    }),
  );

  assert.equal(entitlements.allowBasicScan, true);
  assert.equal(entitlements.allowProfessionalScan, false);
  assert.equal(entitlements.allowBasicPdf, false);
  assert.equal(entitlements.allowProfessionalPdf, false);
});

test("Basic Report entitlements", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      name: "Basic Report",
      slug: "basic-report",
      billingType: "ONE_TIME",
      allowBasicScan: true,
      allowBasicPdf: true,
      basicPdfCredits: 1,
      totalReportCredits: 1,
      reportCredits: 1,
      price: "19",
    }),
  );

  assert.equal(entitlements.allowBasicScan, true);
  assert.equal(entitlements.allowProfessionalScan, false);
  assert.equal(entitlements.allowBasicPdf, true);
  assert.equal(entitlements.allowProfessionalPdf, false);
  assert.equal(entitlements.basicPdfCredits, 1);
});

test("Pro Report entitlements", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      name: "Pro Report",
      slug: "pro-report",
      billingType: "ONE_TIME",
      allowBasicScan: true,
      allowProfessionalScan: true,
      allowBasicPdf: true,
      allowProfessionalPdf: true,
      professionalPdfCredits: 1,
      allowManualReview: true,
      lightManualReviewCredits: 1,
      totalReportCredits: 1,
      reportCredits: 1,
      price: "49",
    }),
  );

  assert.equal(entitlements.allowProfessionalScan, true);
  assert.equal(entitlements.allowProfessionalPdf, true);
  assert.equal(entitlements.professionalPdfCredits, 1);
  assert.equal(entitlements.lightManualReviewCredits, 1);
});

test("Agency Starter entitlements", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      name: "Agency Starter",
      slug: "agency-starter",
      billingType: "MONTHLY",
      allowBasicScan: true,
      allowProfessionalScan: true,
      allowBasicPdf: true,
      allowProfessionalPdf: true,
      professionalPdfCredits: 25,
      totalReportCredits: 25,
      allowWhiteLabel: true,
      allowClientManagement: true,
      allowShareLinks: true,
      reportCredits: 25,
      price: "49",
    }),
  );

  assert.equal(entitlements.allowProfessionalScan, true);
  assert.equal(entitlements.professionalPdfCredits, 25);
  assert.equal(entitlements.allowWhiteLabel, true);
  assert.equal(entitlements.allowClientManagement, true);
  assert.equal(entitlements.allowShareLinks, true);
});

test("Agency Pro entitlements", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      name: "Agency Pro",
      slug: "agency-pro",
      billingType: "MONTHLY",
      allowBasicScan: true,
      allowProfessionalScan: true,
      professionalScanLimitPerDay: 100,
      allowBasicPdf: true,
      allowProfessionalPdf: true,
      professionalPdfCredits: 100,
      totalReportCredits: 100,
      allowHidePoweredBy: true,
      allowPriorityGuidance: true,
      allowPrioritySupport: true,
      reportCredits: 100,
      price: "99",
    }),
  );

  assert.equal(entitlements.professionalScanLimitPerDay, 100);
  assert.equal(entitlements.professionalPdfCredits, 100);
  assert.equal(entitlements.allowHidePoweredBy, true);
  assert.equal(entitlements.allowPriorityGuidance, true);
  assert.equal(entitlements.allowPrioritySupport, true);
});

test("Manual Review Add-on entitlements", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      name: "Manual Review Add-on",
      slug: "manual-review-addon",
      billingType: "ADDON",
      allowBasicScan: false,
      allowProfessionalScan: false,
      allowManualReview: true,
      deepManualReviewCredits: 1,
      totalReportCredits: 0,
      reportCredits: 0,
      price: "149",
    }),
  );

  assert.equal(entitlements.allowBasicScan, false);
  assert.equal(entitlements.allowProfessionalScan, false);
  assert.equal(entitlements.deepManualReviewCredits, 1);
  assert.equal(entitlements.totalReportCredits, 0);
});

test("canSubmitScan checks", () => {
  const freeDemo = normalizePlanEntitlements(
    makePlan({
      name: "Free Demo",
      slug: "free-demo",
      billingType: "FREE",
      allowBasicScan: true,
    }),
  );
  const proReport = normalizePlanEntitlements(
    makePlan({
      name: "Pro Report",
      slug: "pro-report",
      billingType: "ONE_TIME",
      allowBasicScan: true,
      allowProfessionalScan: true,
    }),
  );

  assert.equal(canSubmitScanForEntitlements(freeDemo, "BASIC").allowed, true);
  assert.equal(canSubmitScanForEntitlements(freeDemo, "PROFESSIONAL").allowed, false);
  assert.equal(canSubmitScanForEntitlements(proReport, "PROFESSIONAL").allowed, true);
});

test("Phase 24D scan access matrix for base plans and add-on only", () => {
  const freeDemo = normalizePlanEntitlements(
    makePlan({
      name: "Free Demo",
      slug: "free-demo",
      billingType: "FREE",
      allowBasicScan: true,
      allowProfessionalScan: false,
      basicScanLimitPerDay: 3,
      professionalScanLimitPerDay: 0,
    }),
  );
  const basicReport = normalizePlanEntitlements(
    makePlan({
      name: "Basic Report",
      slug: "basic-report",
      billingType: "ONE_TIME",
      allowBasicScan: true,
      allowProfessionalScan: false,
      basicScanLimitPerDay: 25,
      professionalScanLimitPerDay: 0,
    }),
  );
  const proReport = normalizePlanEntitlements(
    makePlan({
      name: "Pro Report",
      slug: "pro-report",
      billingType: "ONE_TIME",
      allowBasicScan: true,
      allowProfessionalScan: true,
      basicScanLimitPerDay: 25,
      professionalScanLimitPerDay: 1,
    }),
  );
  const agencyStarter = normalizePlanEntitlements(
    makePlan({
      name: "Agency Starter",
      slug: "agency-starter",
      billingType: "MONTHLY",
      allowBasicScan: true,
      allowProfessionalScan: true,
      basicScanLimitPerDay: 50,
      professionalScanLimitPerDay: 25,
    }),
  );
  const agencyPro = normalizePlanEntitlements(
    makePlan({
      name: "Agency Pro",
      slug: "agency-pro",
      billingType: "MONTHLY",
      allowBasicScan: true,
      allowProfessionalScan: true,
      basicScanLimitPerDay: 100,
      professionalScanLimitPerDay: 100,
    }),
  );
  const manualReviewAddonOnly = normalizePlanEntitlements(
    makePlan({
      name: "Manual Review Add-on",
      slug: "manual-review-addon",
      billingType: "ADDON",
      allowBasicScan: false,
      allowProfessionalScan: false,
      basicScanLimitPerDay: 0,
      professionalScanLimitPerDay: 0,
      allowManualReview: true,
      deepManualReviewCredits: 1,
    }),
  );

  assert.equal(canSubmitScanForEntitlements(freeDemo, "BASIC").allowed, true);
  assert.equal(canSubmitScanForEntitlements(freeDemo, "PROFESSIONAL").allowed, false);
  assert.equal(freeDemo.basicScanLimitPerDay, 3);
  assert.equal(freeDemo.professionalScanLimitPerDay, 0);

  assert.equal(canSubmitScanForEntitlements(basicReport, "BASIC").allowed, true);
  assert.equal(canSubmitScanForEntitlements(basicReport, "PROFESSIONAL").allowed, false);
  assert.equal(basicReport.basicScanLimitPerDay, 25);
  assert.equal(basicReport.professionalScanLimitPerDay, 0);

  assert.equal(canSubmitScanForEntitlements(proReport, "PROFESSIONAL").allowed, true);
  assert.equal(proReport.professionalScanLimitPerDay, 1);

  assert.equal(canSubmitScanForEntitlements(agencyStarter, "PROFESSIONAL").allowed, true);
  assert.equal(agencyStarter.professionalScanLimitPerDay, 25);

  assert.equal(canSubmitScanForEntitlements(agencyPro, "PROFESSIONAL").allowed, true);
  assert.equal(agencyPro.professionalScanLimitPerDay, 100);

  assert.equal(canSubmitScanForEntitlements(manualReviewAddonOnly, "BASIC").allowed, false);
  assert.equal(
    canSubmitScanForEntitlements(manualReviewAddonOnly, "PROFESSIONAL").allowed,
    false,
  );
});

test("Phase 24D scan access returns user-facing reasons", () => {
  const freeDemo = normalizePlanEntitlements(
    makePlan({
      name: "Free Demo",
      slug: "free-demo",
      billingType: "FREE",
      allowBasicScan: true,
      allowProfessionalScan: false,
    }),
  );

  const blockedProfessional = canSubmitScanForEntitlements(freeDemo, "PROFESSIONAL");
  const invalidType = canSubmitScanForEntitlements(freeDemo, "invalid");

  assert.equal(blockedProfessional.allowed, false);
  assert.equal(
    blockedProfessional.reason,
    "Your current plan does not include Professional Scan.",
  );
  assert.equal(invalidType.allowed, false);
  assert.equal(invalidType.reason, "Invalid scan type selected.");
});

test("canGeneratePdf checks", () => {
  const freeDemo = normalizePlanEntitlements(
    makePlan({
      name: "Free Demo",
      slug: "free-demo",
      billingType: "FREE",
      allowBasicPdf: false,
      allowProfessionalPdf: false,
      totalReportCredits: 0,
      reportCredits: 0,
    }),
  );
  const basicReport = normalizePlanEntitlements(
    makePlan({
      name: "Basic Report",
      slug: "basic-report",
      billingType: "ONE_TIME",
      allowBasicPdf: true,
      basicPdfCredits: 1,
      totalReportCredits: 1,
      reportCredits: 1,
    }),
  );
  const proReport = normalizePlanEntitlements(
    makePlan({
      name: "Pro Report",
      slug: "pro-report",
      billingType: "ONE_TIME",
      allowBasicPdf: true,
      allowProfessionalPdf: true,
      professionalPdfCredits: 1,
      totalReportCredits: 1,
      reportCredits: 1,
    }),
  );

  const freeBasicBlocked = canGeneratePdfForEntitlements(freeDemo, "BASIC");
  const basicProfessionalBlocked = canGeneratePdfForEntitlements(
    basicReport,
    "PROFESSIONAL",
  );

  assert.equal(canGeneratePdfForEntitlements(basicReport, "BASIC").allowed, true);
  assert.equal(basicProfessionalBlocked.allowed, false);
  assert.equal(
    basicProfessionalBlocked.reason,
    "Your current plan does not include Professional PDF reports.",
  );
  assert.equal(canGeneratePdfForEntitlements(proReport, "PROFESSIONAL").allowed, true);
  assert.equal(freeBasicBlocked.allowed, false);
  assert.equal(
    freeBasicBlocked.reason,
    "Your current plan does not include Basic PDF reports.",
  );
});

test("Phase 24E PDF entitlement matrix for default plans and add-on only", () => {
  const freeDemo = normalizePlanEntitlements(
    makePlan({
      name: "Free Demo",
      slug: "free-demo",
      billingType: "FREE",
      allowBasicPdf: false,
      allowProfessionalPdf: false,
      totalReportCredits: 0,
      reportCredits: 0,
    }),
  );
  const basicReport = normalizePlanEntitlements(
    makePlan({
      name: "Basic Report",
      slug: "basic-report",
      billingType: "ONE_TIME",
      allowBasicPdf: true,
      allowProfessionalPdf: false,
      basicPdfCredits: 1,
      totalReportCredits: 1,
      reportCredits: 1,
    }),
  );
  const proReport = normalizePlanEntitlements(
    makePlan({
      name: "Pro Report",
      slug: "pro-report",
      billingType: "ONE_TIME",
      allowBasicPdf: true,
      allowProfessionalPdf: true,
      professionalPdfCredits: 1,
      totalReportCredits: 1,
      reportCredits: 1,
    }),
  );
  const agencyStarter = normalizePlanEntitlements(
    makePlan({
      name: "Agency Starter",
      slug: "agency-starter",
      billingType: "MONTHLY",
      allowBasicPdf: true,
      allowProfessionalPdf: true,
      professionalPdfCredits: 25,
      totalReportCredits: 25,
      reportCredits: 25,
    }),
  );
  const manualReviewAddonOnly = normalizePlanEntitlements(
    makePlan({
      name: "Manual Review Add-on",
      slug: "manual-review-addon",
      billingType: "ADDON",
      allowBasicPdf: false,
      allowProfessionalPdf: false,
      totalReportCredits: 0,
      reportCredits: 0,
      allowManualReview: true,
      deepManualReviewCredits: 1,
    }),
  );

  assert.equal(canGeneratePdfForEntitlements(freeDemo, "BASIC").allowed, false);
  assert.equal(canGeneratePdfForEntitlements(freeDemo, "PROFESSIONAL").allowed, false);

  assert.equal(canGeneratePdfForEntitlements(basicReport, "BASIC").allowed, true);
  assert.equal(
    canGeneratePdfForEntitlements(basicReport, "PROFESSIONAL").allowed,
    false,
  );

  assert.equal(canGeneratePdfForEntitlements(proReport, "PROFESSIONAL").allowed, true);
  assert.equal(canGeneratePdfForEntitlements(agencyStarter, "PROFESSIONAL").allowed, true);

  assert.equal(
    canGeneratePdfForEntitlements(manualReviewAddonOnly, "BASIC").allowed,
    false,
  );
  assert.equal(
    canGeneratePdfForEntitlements(manualReviewAddonOnly, "PROFESSIONAL").allowed,
    false,
  );
});

test("canCreateShareLink style check through entitlements", () => {
  const basicReport = normalizePlanEntitlements(
    makePlan({
      name: "Basic Report",
      slug: "basic-report",
      billingType: "ONE_TIME",
      allowShareLinks: false,
    }),
  );
  const agencyStarter = normalizePlanEntitlements(
    makePlan({
      name: "Agency Starter",
      slug: "agency-starter",
      billingType: "MONTHLY",
      allowShareLinks: true,
    }),
  );

  assert.equal(canCreateShareLinkForEntitlements(basicReport), false);
  assert.equal(canCreateShareLinkForEntitlements(agencyStarter), true);
});

test("canUseManualReview checks", () => {
  const proReport = normalizePlanEntitlements(
    makePlan({
      name: "Pro Report",
      slug: "pro-report",
      billingType: "ONE_TIME",
      allowManualReview: true,
      lightManualReviewCredits: 1,
    }),
  );
  const basicReport = normalizePlanEntitlements(
    makePlan({
      name: "Basic Report",
      slug: "basic-report",
      billingType: "ONE_TIME",
      allowManualReview: false,
    }),
  );
  const manualReviewAddon = normalizePlanEntitlements(
    makePlan({
      name: "Manual Review Add-on",
      slug: "manual-review-addon",
      billingType: "ADDON",
      allowManualReview: true,
      deepManualReviewCredits: 1,
    }),
  );

  assert.equal(canUseManualReviewForEntitlements(proReport, "LIGHT").allowed, true);
  assert.equal(canUseManualReviewForEntitlements(basicReport, "LIGHT").allowed, false);
  assert.equal(canUseManualReviewForEntitlements(manualReviewAddon, "DEEP").allowed, true);
});

test("Missing plan fallback returns safe Free Demo fallback without crash", () => {
  const entitlements = normalizePlanEntitlements(null);

  assert.equal(entitlements.planSlug, "free-demo");
  assert.equal(entitlements.allowBasicScan, true);
  assert.equal(entitlements.allowProfessionalScan, false);
  assert.equal(entitlements.allowBasicPdf, false);
  assert.equal(entitlements.allowProfessionalPdf, false);
});

test("getReadablePlanSummary style output does not leak provider identifiers", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      name: "Agency Pro",
      slug: "agency-pro",
      billingType: "MONTHLY",
      allowProfessionalScan: true,
      allowProfessionalPdf: true,
      allowWhiteLabel: true,
      allowClientManagement: true,
      allowShareLinks: true,
      stripeProductId: "prod_123",
      stripePriceId: "price_123",
      lemonProductId: "lem_prod_123",
      lemonVariantId: "lem_var_123",
    }),
  );
  const summary = buildReadablePlanSummary(entitlements);
  const serialized = JSON.stringify(summary);

  assert.doesNotMatch(serialized, /stripeProductId|stripePriceId|lemonProductId|lemonVariantId/i);
  assert.equal(summary.planName, "Agency Pro");
});
