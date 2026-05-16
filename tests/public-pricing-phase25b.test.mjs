import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(filePath) {
  return readFile(filePath, "utf8");
}

test("public pricing helper keeps the six real plan names and removes legacy marketing plans", async () => {
  const helper = await source("src/lib/marketing/public-pricing.ts");

  assert.match(helper, /"Free Demo"/);
  assert.match(helper, /"Basic Report"/);
  assert.match(helper, /"Pro Report"/);
  assert.match(helper, /"Agency Starter"/);
  assert.match(helper, /"Agency Pro"/);
  assert.match(helper, /"Manual Review Add-on"/);

  assert.doesNotMatch(helper, /name:\s*"Starter"/);
  assert.doesNotMatch(helper, /name:\s*"Agency"/);
  assert.doesNotMatch(helper, /name:\s*"Business"/);
});

test("public pages use dashboard-only payment messaging and remove outdated stripe/admin planned copy", async () => {
  const helper = await source("src/lib/marketing/public-pricing.ts");
  const preview = await source("src/components/marketing/pricing-preview.tsx");
  const pricingPage = await source("src/app/pricing/page.tsx");

  assert.match(preview, /getPublicPricingContent/);
  assert.match(pricingPage, /getPublicPricingContent/);
  assert.match(preview, /PublicPricingCards plans=\{pricing\.plans\}/);
  assert.match(pricingPage, /PublicPricingCards plans=\{pricing\.plans\} showFullLimits/);

  assert.match(
    helper,
    /Manual payment is available after login\. Submit payment proof from your dashboard\./,
  );
  assert.match(
    helper,
    /International card payment is not available yet\. Manual payment remains available after login\./,
  );

  assert.doesNotMatch(preview, /Stripe-backed plans|Admin controls planned|future billing foundation/);
  assert.doesNotMatch(pricingPage, /Stripe-backed plans|Admin controls planned|future billing foundation/);
});

test("public pricing cta routes stay auth-safe and point to signup or dashboard billing", async () => {
  const helper = await source("src/lib/marketing/public-pricing.ts");

  assert.match(helper, /return "\/signup";/);
  assert.match(helper, /return `\/signup\?plan=\$\{slug\}`;/);
  assert.match(helper, /return `\/dashboard\/billing\?plan=\$\{slug\}`;/);
  assert.match(helper, /return "\/dashboard\/billing#manual-payment";/);
  assert.doesNotMatch(
    helper,
    /\/api\/billing\/stripe\/checkout|\/api\/billing\/lemon\/checkout|payment-proof|manual-payment-form/,
  );
});

test("manual review and agency pro wording stays accurate", async () => {
  const helper = await source("src/lib/marketing/public-pricing.ts");

  assert.match(helper, /Requires an existing generated report/);
  assert.match(
    helper,
    /Priority guidance included\. Deep manual reviews are sold separately\./,
  );
  assert.doesNotMatch(helper, /unlimited deep manual review/i);
});

test("public pricing pages remain presentation-only and do not expose payment internals", async () => {
  const preview = await source("src/components/marketing/pricing-preview.tsx");
  const pricingPage = await source("src/app/pricing/page.tsx");
  const helper = await source("src/lib/marketing/public-pricing.ts");
  const combined = `${preview}\n${pricingPage}\n${helper}`;

  assert.doesNotMatch(combined, /ManualPaymentForm|payment-proof|\/api\/billing\/payment-proof/);
  assert.doesNotMatch(combined, /EasyPaisa|JazzCash|bank transfer details|account number/i);
  assert.doesNotMatch(combined, /stripePriceId|stripeProductId|lemonVariantId|lemonProductId|providerEventId/);
});
