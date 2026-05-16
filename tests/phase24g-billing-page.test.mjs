import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(filePath) {
  return readFile(filePath, "utf8");
}

function availablePlansSection(source) {
  const startMarker = '<section id="available-plans"';
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, "Missing available plans section");
  const end = source.indexOf("</section>", start);
  assert.notEqual(end, -1, "Missing available plans section end");

  return source.slice(start, end);
}

function yourPlanIncludesSection(source) {
  const startMarker = "<CardTitle>Your plan includes</CardTitle>";
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, "Missing your plan includes section");
  const end = source.indexOf("</Card>", start);
  assert.notEqual(end, -1, "Missing your plan includes card end");

  return source.slice(start, end);
}

test("billing page keeps auth gate and current plan summary blocks", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");

  assert.match(source, /await requireUser\(\)/);
  assert.match(source, /label="Current plan"/);
  assert.match(source, /label="Credits remaining"/);
  assert.match(source, /label="Status"/);
  assert.match(source, /label="Period end"/);
});

test("billing page keeps compact current plan includes section", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");
  const section = yourPlanIncludesSection(source);

  assert.match(section, /Your plan includes/);
  assert.match(section, /Current access based on your active plan\./);
  assert.match(section, /View full plan details/);
  assert.match(source, /getCompactIncludedItems/);
  assert.match(source, /deep manual review included/);
  assert.match(section, /Deep manual reviews are sold separately\./);
  assert.doesNotMatch(section, />Scan access<\/p>/);
  assert.doesNotMatch(section, />PDF access<\/p>/);
  assert.doesNotMatch(section, /Agency and client features/);
  assert.doesNotMatch(section, /Manual review<\/p>/);
  assert.doesNotMatch(section, /: Not included|not included/);
});

test("available plan cards use best-for, included-only summary, and full limits accordion", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");

  assert.match(source, /Best for testing the scanner\./);
  assert.match(source, /Best for one basic website report\./);
  assert.match(source, /Best for one professional report with light review\./);
  assert.match(source, /Best for small agencies and freelancers\./);
  assert.match(source, /Best for active agencies managing client reports\./);
  assert.match(source, /Best for deep human review of an existing report\./);
  assert.match(source, /Includes/);
  assert.match(source, /View full limits/);
  assert.match(source, /Basic Scan: \{includedLabel\(planEntitlements\.allowBasicScan\)\}/);
  assert.match(
    source,
    /Professional Scan:\s*\{" "\}\s*\{includedLabel\(planEntitlements\.allowProfessionalScan\)\}/,
  );
  assert.match(
    source,
    /Professional PDF reports:\s*\{" "\}\s*\{includedLabel\(planEntitlements\.allowProfessionalPdf\)\}/,
  );
  assert.match(source, /No PDF reports/);
  assert.match(source, /Requires an existing generated report\./);
  assert.match(source, /No scan or PDF credits included\./);
  assert.match(
    source,
    /Priority guidance included\. Deep manual reviews are sold separately\./,
  );
});

test("billing page keeps unified payment history and hides provider IDs", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");

  assert.match(source, /Payment History/);
  assert.doesNotMatch(source, /Recent payments/);
  assert.doesNotMatch(source, /Payment request history/);
  assert.doesNotMatch(source, /Stripe customer|Stripe subscription/);
  assert.doesNotMatch(source, /Lemon customer|Lemon subscription/);
  assert.doesNotMatch(source, /providerEventId/);
});

test("billing page keeps one Lemon unavailable notice and hides Stripe when unconfigured", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");
  const normalizedSource = source.replace(/\s+/g, " ");
  const lemonUnavailableMatches =
    normalizedSource.match(
      /International card payment is not available yet\. Manual payment remains available\./g,
    ) ?? [];

  assert.equal(lemonUnavailableMatches.length, 1);
  assert.match(source, /lemonBilling\.checkoutConfigured/);
  assert.match(source, /stripeBilling\.checkoutConfigured/);
  assert.doesNotMatch(source, /Stripe kept for future|Stripe disabled/);
});

test("available plan cards remove repeated default not-included blocks and keep CTA rules", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");
  const section = availablePlansSection(source);

  assert.match(section, /Request manual payment/);
  assert.match(section, /Current plan/);
  assert.match(section, /No checkout required/);
  assert.doesNotMatch(section, /Scan access|PDF access/);
  assert.doesNotMatch(
    section,
    /Professional Scan is not included in this plan\.|Basic PDF reports are not included in this plan\.|Professional PDF reports are not included in this plan\./,
  );
});
