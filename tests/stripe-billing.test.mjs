import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStripeCheckoutMetadata,
  centsToDecimalAmount,
  mapStripeSubscriptionStatus,
  shouldGrantInvoicePeriodCredits,
} from "../src/lib/stripe-billing.ts";
import {
  computeStripeSignature,
  getStripeConfigStatus,
  maskStripeId,
  verifyStripeWebhookSignature,
} from "../src/lib/stripe.ts";

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test("Stripe config reports unavailable when keys are missing", () => {
  const previousSecretKey = process.env.STRIPE_SECRET_KEY;
  const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const previousPublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  assert.deepEqual(getStripeConfigStatus(), {
    secretKeyConfigured: false,
    webhookSecretConfigured: false,
    publishableKeyConfigured: false,
    checkoutConfigured: false,
  });

  restoreEnv("STRIPE_SECRET_KEY", previousSecretKey);
  restoreEnv("STRIPE_WEBHOOK_SECRET", previousWebhookSecret);
  restoreEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", previousPublishableKey);
});

test("Stripe webhook signature validation accepts matching signatures", () => {
  const rawBody = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });
  const secret = "whsec_test_secret";
  const timestamp = 1_700_000_000;
  const signature = computeStripeSignature(rawBody, secret, timestamp);

  assert.equal(
    verifyStripeWebhookSignature({
      rawBody,
      signatureHeader: `t=${timestamp},v1=${signature}`,
      webhookSecret: secret,
      toleranceSeconds: 0,
    }),
    true,
  );
});

test("Stripe webhook signature validation rejects invalid signatures", () => {
  assert.equal(
    verifyStripeWebhookSignature({
      rawBody: "{\"id\":\"evt_test\"}",
      signatureHeader: "t=1700000000,v1=bad",
      webhookSecret: "whsec_test_secret",
      toleranceSeconds: 0,
    }),
    false,
  );
});

test("checkout metadata includes only server-owned purchase values", () => {
  assert.deepEqual(
    buildStripeCheckoutMetadata({
      userId: "user_123",
      planId: "plan_123",
      credits: 25,
      appPaymentType: "subscription",
    }),
    {
      userId: "user_123",
      planId: "plan_123",
      packageId: "",
      credits: "25",
      appPaymentType: "subscription",
    },
  );
});

test("subscription status maps Stripe states to local states", () => {
  assert.equal(mapStripeSubscriptionStatus("active"), "ACTIVE");
  assert.equal(mapStripeSubscriptionStatus("trialing"), "ACTIVE");
  assert.equal(mapStripeSubscriptionStatus("past_due"), "PAST_DUE");
  assert.equal(mapStripeSubscriptionStatus("canceled"), "CANCELLED");
  assert.equal(mapStripeSubscriptionStatus("paused"), "INACTIVE");
});

test("invoice period credits are granted only for a new billing period", () => {
  const subscription = {
    currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
    currentPeriodEnd: new Date("2026-02-01T00:00:00.000Z"),
  };

  assert.equal(
    shouldGrantInvoicePeriodCredits(subscription, {
      start: new Date("2026-01-01T00:00:00.000Z"),
      end: new Date("2026-02-01T00:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    shouldGrantInvoicePeriodCredits(subscription, {
      start: new Date("2026-02-01T00:00:00.000Z"),
      end: new Date("2026-03-01T00:00:00.000Z"),
    }),
    true,
  );
});

test("Stripe amounts and identifiers are rendered safely", () => {
  assert.equal(centsToDecimalAmount(4999), "49.99");
  assert.equal(maskStripeId("cs_test_1234567890abcdef"), "cs_test_...cdef");
  assert.equal(maskStripeId(null), "None");
});
