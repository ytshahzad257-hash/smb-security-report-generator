import assert from "node:assert/strict";
import test from "node:test";

import {
  canUseProfessionalScanForPlan,
  canDownloadPdfForSubscription,
  canUseWhiteLabelForPlan,
  createCreditState,
  deductCreditBalance,
  hasReportCreditFromCredits,
} from "../src/lib/billing-rules.ts";

test("hasReportCredit returns true when credits remain", () => {
  assert.equal(hasReportCreditFromCredits({ creditsRemaining: 1 }), true);
});

test("hasReportCredit returns false when credits are empty", () => {
  assert.equal(hasReportCreditFromCredits({ creditsRemaining: 0 }), false);
});

test("deductReportCredit decrements one credit", () => {
  assert.deepEqual(
    deductCreditBalance({
      creditsTotal: 1,
      creditsUsed: 0,
      creditsRemaining: 1,
    }),
    {
      creditsTotal: 1,
      creditsUsed: 1,
      creditsRemaining: 0,
    },
  );
});

test("deductReportCredit prevents credits below zero", () => {
  assert.deepEqual(
    deductCreditBalance({
      creditsTotal: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
    }),
    {
      creditsTotal: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
    },
  );
});

test("canUseWhiteLabel follows plan access", () => {
  assert.equal(canUseWhiteLabelForPlan({ whiteLabelEnabled: true }), true);
  assert.equal(canUseWhiteLabelForPlan({ whiteLabelEnabled: false }), false);
});

test("canDownloadPdf blocks Free Demo", () => {
  assert.equal(
    canDownloadPdfForSubscription({
      creditsRemaining: 0,
      plan: {
        billingType: "FREE",
        reportCredits: 0,
        whiteLabelEnabled: false,
      },
    }),
    false,
  );
});

test("canDownloadPdf allows paid plans with remaining credits", () => {
  assert.equal(
    canDownloadPdfForSubscription({
      creditsRemaining: 1,
      plan: {
        billingType: "ONE_TIME",
        reportCredits: 1,
        whiteLabelEnabled: false,
      },
    }),
    true,
  );
});

test("credit state starts with all plan credits remaining", () => {
  assert.deepEqual(createCreditState(25), {
    creditsTotal: 25,
    creditsUsed: 0,
    creditsRemaining: 25,
  });
});

test("professional scan access follows allowed plan slugs", () => {
  assert.equal(
    canUseProfessionalScanForPlan({ billingType: "FREE", slug: "free-demo" }),
    false,
  );
  assert.equal(
    canUseProfessionalScanForPlan({ billingType: "ONE_TIME", slug: "basic-report" }),
    false,
  );
  assert.equal(
    canUseProfessionalScanForPlan({ billingType: "ONE_TIME", slug: "pro-report" }),
    true,
  );
  assert.equal(
    canUseProfessionalScanForPlan({ billingType: "MONTHLY", slug: "agency-pro" }),
    true,
  );
});
