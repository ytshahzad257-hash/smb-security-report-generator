import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildLemonCheckoutCustomData,
  computeLemonSignature,
  constructLemonWebhookEvent,
  ensureLemonCheckoutConfigured,
  getLemonConfigStatus,
  getLemonEventStorageKey,
  getLemonHealthChecks,
  getLemonUnavailableMessage,
  maskLemonId,
  verifyLemonWebhookSignature,
} from "../src/lib/lemon.ts";
import {
  mapLemonSubscriptionStatus,
  shouldGrantLemonInvoiceCredits,
} from "../src/lib/lemon-billing.ts";

const lemonEnvNames = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_STORE_ID",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "LEMONSQUEEZY_BASIC_REPORT_VARIANT_ID",
  "LEMONSQUEEZY_PRO_REPORT_VARIANT_ID",
  "LEMONSQUEEZY_AGENCY_STARTER_VARIANT_ID",
  "LEMONSQUEEZY_AGENCY_PRO_VARIANT_ID",
  "LEMONSQUEEZY_MANUAL_REVIEW_VARIANT_ID",
  "LEMONSQUEEZY_5_CREDITS_VARIANT_ID",
  "LEMONSQUEEZY_10_CREDITS_VARIANT_ID",
  "LEMONSQUEEZY_25_CREDITS_VARIANT_ID",
];

function snapshotEnv() {
  return Object.fromEntries(lemonEnvNames.map((name) => [name, process.env[name]]));
}

function restoreEnv(snapshot) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function clearLemonEnv() {
  for (const name of lemonEnvNames) {
    delete process.env[name];
  }
}

test("Lemon config reports checkout unavailable when env variables are missing", () => {
  const previous = snapshotEnv();
  clearLemonEnv();

  const status = getLemonConfigStatus();

  assert.equal(status.apiKeyConfigured, false);
  assert.equal(status.storeIdConfigured, false);
  assert.equal(status.webhookSecretConfigured, false);
  assert.equal(status.allVariantIdsConfigured, false);
  assert.equal(status.checkoutConfigured, false);
  assert.throws(() => ensureLemonCheckoutConfigured(), {
    message: "International card payment is not configured yet.",
  });
  assert.equal(
    getLemonUnavailableMessage(),
    "International card payment is not available yet. Manual payment remains available.",
  );

  restoreEnv(previous);
});

test("Lemon config becomes checkout-ready only when every required env is present", () => {
  const previous = snapshotEnv();

  for (const [index, name] of lemonEnvNames.entries()) {
    process.env[name] = String(index + 1);
  }

  const status = getLemonConfigStatus();

  assert.equal(status.apiKeyConfigured, true);
  assert.equal(status.storeIdConfigured, true);
  assert.equal(status.webhookSecretConfigured, true);
  assert.equal(status.allVariantIdsConfigured, true);
  assert.equal(status.checkoutConfigured, true);

  restoreEnv(previous);
});

test("billing page keeps manual payment visible and shows a single clear Lemon unavailable notice", async () => {
  const source = await readFile("src/app/dashboard/billing/page.tsx", "utf8");

  assert.match(source, /Manual Payment/);
  assert.match(source, /International card payment is not available yet/);
  assert.match(source, /Manual payment remains/);
  assert.match(source, /View Card Payment Options/);
  assert.doesNotMatch(source, /Stripe kept for future|Stripe disabled/);
  assert.doesNotMatch(source, /Buy Credits with Card/);
});

test("checkout route returns the safe missing-config error and does not grant credits", async () => {
  const source = await readFile("src/app/api/billing/lemon/checkout/route.ts", "utf8");

  assert.match(source, /International card payment is not configured yet\./);
  assert.doesNotMatch(source, /creditsRemaining:\s*\{\s*increment/);
  assert.doesNotMatch(source, new RegExp(["activate", "Plan", "For", "User"].join("")));
});

test("Lemon checkout metadata uses server-owned purchase values", () => {
  assert.deepEqual(
    buildLemonCheckoutCustomData({
      userId: "user_123",
      planId: "plan_123",
      packageKey: "agency-starter",
      credits: 25,
      appPaymentType: "subscription",
      paymentId: "pay_123",
    }),
    {
      userId: "user_123",
      planId: "plan_123",
      packageId: "",
      packageKey: "agency-starter",
      credits: "25",
      appPaymentType: "subscription",
      paymentId: "pay_123",
    },
  );
});

test("Lemon webhook signature validation accepts matching signatures", () => {
  const rawBody = JSON.stringify({
    meta: { event_name: "order_created" },
    data: { type: "orders", id: "1" },
  });
  const secret = "lemon_webhook_secret";
  const signature = computeLemonSignature(rawBody, secret);

  assert.equal(
    verifyLemonWebhookSignature({
      rawBody,
      signatureHeader: signature,
      webhookSecret: secret,
    }),
    true,
  );
  assert.deepEqual(
    constructLemonWebhookEvent({
      rawBody,
      signatureHeader: signature,
      webhookSecret: secret,
    }).meta?.event_name,
    "order_created",
  );
});

test("Lemon webhook signature validation rejects missing or invalid signatures", () => {
  assert.equal(
    verifyLemonWebhookSignature({
      rawBody: "{\"id\":\"evt_test\"}",
      signatureHeader: null,
      webhookSecret: "lemon_webhook_secret",
    }),
    false,
  );
  assert.equal(
    verifyLemonWebhookSignature({
      rawBody: "{\"id\":\"evt_test\"}",
      signatureHeader: "bad",
      webhookSecret: "lemon_webhook_secret",
    }),
    false,
  );
});

test("Lemon webhook idempotency key is stable for duplicate deliveries", () => {
  const event = {
    meta: { event_name: "order_created" },
    data: { type: "orders", id: "42", attributes: { status: "paid" } },
  };
  const rawBody = JSON.stringify(event);

  assert.equal(
    getLemonEventStorageKey({ event, rawBody }),
    getLemonEventStorageKey({ event, rawBody }),
  );
  assert.notEqual(
    getLemonEventStorageKey({ event, rawBody }),
    getLemonEventStorageKey({
      event: {
        ...event,
        data: {
          ...event.data,
          attributes: { status: "paid", updated_at: "2026-05-14T00:00:00Z" },
        },
      },
      rawBody: JSON.stringify({
        ...event,
        data: {
          ...event.data,
          attributes: { status: "paid", updated_at: "2026-05-14T00:00:00Z" },
        },
      }),
    }),
  );
});

test("Lemon renewal invoices are the only subscription payments that add credits", () => {
  assert.equal(
    shouldGrantLemonInvoiceCredits({
      billingReason: "initial",
      paymentStatus: "paid",
    }),
    false,
  );
  assert.equal(
    shouldGrantLemonInvoiceCredits({
      billingReason: "renewal",
      paymentStatus: "paid",
    }),
    true,
  );
  assert.equal(
    shouldGrantLemonInvoiceCredits({
      billingReason: "renewal",
      paymentStatus: "failed",
    }),
    false,
  );
});

test("Lemon subscription states map to local statuses", () => {
  assert.equal(mapLemonSubscriptionStatus("active"), "ACTIVE");
  assert.equal(mapLemonSubscriptionStatus("on_trial"), "ACTIVE");
  assert.equal(mapLemonSubscriptionStatus("past_due"), "PAST_DUE");
  assert.equal(mapLemonSubscriptionStatus("cancelled"), "CANCELLED");
  assert.equal(mapLemonSubscriptionStatus("expired"), "CANCELLED");
  assert.equal(mapLemonSubscriptionStatus("paused"), "INACTIVE");
});

test("admin Lemon health checks expose booleans only, not secret values", () => {
  const previous = snapshotEnv();

  process.env.LEMONSQUEEZY_API_KEY = "lemon_secret_api_key_value";
  process.env.LEMONSQUEEZY_STORE_ID = "123";
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "lemon_secret_webhook_value";

  const health = getLemonHealthChecks();
  const rendered = JSON.stringify(health);

  assert.equal(typeof health.lemonSqueezyApiKeyConfigured, "boolean");
  assert.equal(typeof health.lemonSqueezyWebhookSecretConfigured, "boolean");
  assert.doesNotMatch(rendered, /lemon_secret_api_key_value/);
  assert.doesNotMatch(rendered, /lemon_secret_webhook_value/);

  restoreEnv(previous);
});

test("Lemon identifiers are masked in admin-safe displays", () => {
  const id = "lemonsqueezy_identifier_123456789";

  assert.equal(maskLemonId(id), "lemonsqu...6789");
  assert.notEqual(maskLemonId(id), id);
  assert.equal(maskLemonId(null), "None");
});
