import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(filePath) {
  return readFile(filePath, "utf8");
}

test("billing view details includes compact usage remaining section", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");

  assert.match(source, /Usage remaining/);
  assert.match(source, /Basic scans today/);
  assert.match(source, /Professional scans today/);
  assert.match(source, /Report credits/);
  assert.match(source, /Basic PDF reports/);
  assert.match(source, /Professional PDF reports/);
  assert.match(source, /Manual reviews/);
  assert.match(source, /Report credits are shared across PDF reports\./);
});

test("billing usage remaining reads scan usage for current user only and today window", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");

  assert.match(source, /prisma\.scan\.groupBy\(/);
  assert.match(source, /where:\s*\{\s*userId:\s*user\.id,/s);
  assert.match(source, /scanType:\s*\{\s*in:\s*\["BASIC",\s*"PROFESSIONAL"\]/s);
  assert.match(source, /createdAt:\s*\{\s*gte:\s*dayStart,\s*lt:\s*dayEnd/s);
});

test("billing usage remaining keeps non-negative remaining math", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");

  assert.match(source, /return Math\.max\(0, allowed - used\);/);
  assert.match(source, /basicScansRemainingToday/);
  assert.match(source, /professionalScansRemainingToday/);
  assert.match(source, /reportCreditsRemaining/);
});

test("billing usage remaining is driven by dynamic entitlements", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");

  assert.match(source, /currentEntitlements\.basicScanLimitPerDay/);
  assert.match(source, /currentEntitlements\.professionalScanLimitPerDay/);
  assert.match(source, /currentEntitlements\.allowBasicPdf/);
  assert.match(source, /currentEntitlements\.allowProfessionalPdf/);
  assert.match(source, /currentEntitlements\.lightManualReviewCredits/);
  assert.match(source, /currentEntitlements\.deepManualReviewCredits/);
  assert.match(source, /currentEntitlements\.allowPriorityGuidance/);
});
