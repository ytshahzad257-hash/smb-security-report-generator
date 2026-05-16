import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canCreateShareLinkForEntitlements,
  canHidePoweredByForEntitlements,
  canUseAgencyBrandingForEntitlements,
  canUseClientManagementForEntitlements,
  canUseManualReviewForEntitlements,
  canUseWhiteLabelForEntitlements,
  normalizePlanEntitlements,
} from "../src/lib/billing/planEntitlements.ts";

function makePlan(overrides = {}) {
  return {
    id: "plan_phase24f",
    name: "Phase 24F Plan",
    slug: "phase-24f-plan",
    price: "0",
    currency: "USD",
    billingType: "FREE",
    allowBasicScan: true,
    allowProfessionalScan: false,
    basicScanLimitPerDay: 3,
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

async function readSource(filePath) {
  return readFile(filePath, "utf8");
}

test("allowWhiteLabel=false and allowAgencyBranding=false blocks agency branding save helper", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      allowAgencyBranding: false,
      allowWhiteLabel: false,
    }),
  );

  assert.equal(canUseWhiteLabelForEntitlements(entitlements), false);
});

test("allowWhiteLabel=true allows agency branding save helper", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      allowWhiteLabel: true,
    }),
  );

  assert.equal(canUseWhiteLabelForEntitlements(entitlements), true);
});

test("allowAgencyBranding=false blocks agency logo upload helper", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      allowAgencyBranding: false,
      allowWhiteLabel: false,
    }),
  );

  assert.equal(canUseAgencyBrandingForEntitlements(entitlements), false);
});

test("allowHidePoweredBy=false prevents powered-by removal helper", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      allowHidePoweredBy: false,
    }),
  );

  assert.equal(canHidePoweredByForEntitlements(entitlements), false);
});

test("allowHidePoweredBy=true allows powered-by removal helper", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      allowHidePoweredBy: true,
    }),
  );

  assert.equal(canHidePoweredByForEntitlements(entitlements), true);
});

test("allowClientManagement=false blocks client management helper", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      allowClientManagement: false,
    }),
  );

  assert.equal(canUseClientManagementForEntitlements(entitlements), false);
});

test("allowClientManagement=true allows client management helper", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      allowClientManagement: true,
    }),
  );

  assert.equal(canUseClientManagementForEntitlements(entitlements), true);
});

test("allowShareLinks=false blocks share link helper", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      allowShareLinks: false,
    }),
  );

  assert.equal(canCreateShareLinkForEntitlements(entitlements), false);
});

test("allowShareLinks=true allows share link helper", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      allowShareLinks: true,
    }),
  );

  assert.equal(canCreateShareLinkForEntitlements(entitlements), true);
});

test("blocked share link creation path executes before ReportShare create write", async () => {
  const source = await readSource("src/lib/reports/reportSharing.ts");
  const blockedCheckIndex = source.indexOf("if (!canShare)");
  const reportShareCreateIndex = source.indexOf("prisma.reportShare.create");

  assert.notEqual(blockedCheckIndex, -1);
  assert.notEqual(reportShareCreateIndex, -1);
  assert.equal(blockedCheckIndex < reportShareCreateIndex, true);
});

test("manual review is blocked when manual review and priority guidance are both unavailable", () => {
  const entitlements = normalizePlanEntitlements(
    makePlan({
      allowManualReview: false,
      allowPriorityGuidance: false,
      lightManualReviewCredits: 0,
      deepManualReviewCredits: 0,
    }),
  );
  const light = canUseManualReviewForEntitlements(entitlements, "LIGHT");
  const deep = canUseManualReviewForEntitlements(entitlements, "DEEP");

  assert.equal(light.allowed, false);
  assert.equal(
    light.reason,
    "Light manual review is not included in your current plan.",
  );
  assert.equal(deep.allowed, false);
  assert.equal(
    deep.reason,
    "Deep manual review requires a manual review add-on.",
  );
});

test("deep manual review is allowed only when deepManualReviewCredits > 0 and manual review is enabled", () => {
  const noDeepCredits = normalizePlanEntitlements(
    makePlan({
      allowManualReview: true,
      deepManualReviewCredits: 0,
    }),
  );
  const withDeepCredits = normalizePlanEntitlements(
    makePlan({
      allowManualReview: true,
      deepManualReviewCredits: 1,
    }),
  );

  assert.equal(canUseManualReviewForEntitlements(noDeepCredits, "DEEP").allowed, false);
  assert.equal(canUseManualReviewForEntitlements(withDeepCredits, "DEEP").allowed, true);
});

test("priority guidance does not grant unlimited deep manual review", () => {
  const agencyProLike = normalizePlanEntitlements(
    makePlan({
      slug: "agency-pro",
      allowManualReview: true,
      allowPriorityGuidance: true,
      deepManualReviewCredits: 0,
    }),
  );

  const light = canUseManualReviewForEntitlements(agencyProLike, "LIGHT");
  const deep = canUseManualReviewForEntitlements(agencyProLike, "DEEP");

  assert.equal(light.allowed, true);
  assert.equal(deep.allowed, false);
  assert.equal(
    deep.reason,
    "Deep manual review requires a manual review add-on.",
  );
});

test("client routes enforce entitlement checks server-side against manual API attempts", async () => {
  const clientsRoute = await readSource("src/app/api/clients/route.ts");
  const singleClientRoute = await readSource("src/app/api/clients/[id]/route.ts");
  const assignClientRoute = await readSource(
    "src/app/api/scans/[id]/assign-client/route.ts",
  );

  assert.match(clientsRoute, /getPlanEntitlementsForUser/);
  assert.match(singleClientRoute, /getPlanEntitlementsForUser/);
  assert.match(assignClientRoute, /getPlanEntitlementsForUser/);
  assert.match(clientsRoute, /status:\s*403/);
  assert.match(singleClientRoute, /status:\s*403/);
  assert.match(assignClientRoute, /status:\s*403/);
});

test("ownership checks remain present for client and share mutations", async () => {
  const clientService = await readSource("src/lib/clients/clientService.ts");
  const shareService = await readSource("src/lib/reports/reportSharing.ts");

  assert.match(clientService, /where:\s*\{\s*id:\s*clientId,\s*userId/s);
  assert.match(clientService, /deleteMany\(\{\s*where:\s*\{\s*id:\s*clientId,\s*userId/s);
  assert.match(shareService, /where:\s*\{\s*id:\s*reportId,\s*userId,\s*status:\s*"GENERATED"/s);
  assert.match(shareService, /updateMany\(\{\s*where:\s*\{\s*id:\s*shareId,\s*userId/s);
});

test("scan and pdf entitlement checks remain wired in backend services", async () => {
  const scansActionSource = await readSource("src/app/actions/scans.ts");
  const reportServiceSource = await readSource("src/lib/reports/reportService.ts");

  assert.match(scansActionSource, /canSubmitScan/);
  assert.match(reportServiceSource, /canGeneratePdf/);
});
