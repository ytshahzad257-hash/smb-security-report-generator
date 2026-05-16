import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(filePath) {
  return readFile(filePath, "utf8");
}

test("scan submission persists selected scan type and enqueues it", async () => {
  const text = await source("src/app/actions/scans.ts");

  assert.match(text, /scanTypeSchema/);
  assert.match(text, /z\.enum\(\["BASIC",\s*"PROFESSIONAL"\]/);
  assert.match(text, /Invalid scan type selected\./);
  assert.match(text, /scanType,/);
  assert.match(text, /addScanJob\(scan\.id,\s*user\.id,\s*normalizedUrl,\s*scanType\)/);
});

test("scan access is server-validated through plan entitlements", async () => {
  const text = await source("src/app/actions/scans.ts");

  assert.match(text, /getPlanEntitlementsForUser/);
  assert.match(text, /canSubmitScan\(user\.id,\s*scanType\)/);
  assert.match(text, /Your current plan does not include Basic Scan\./);
  assert.match(text, /Your current plan does not include Professional Scan\./);
  assert.match(text, /PLAN_SCAN_ACCESS_BLOCKED/);
});

test("daily plan scan limits are enforced before scan create and queue enqueue", async () => {
  const text = await source("src/app/actions/scans.ts");
  const countIndex = text.indexOf("prisma.scan.count(");
  const createIndex = text.indexOf("prisma.scan.create(");
  const enqueueIndex = text.indexOf("addScanJob(");

  assert.notEqual(countIndex, -1);
  assert.notEqual(createIndex, -1);
  assert.notEqual(enqueueIndex, -1);
  assert.ok(countIndex < createIndex, "Daily scan count check must happen before scan create.");
  assert.ok(createIndex < enqueueIndex, "Scan record should be created before queue enqueue.");
  assert.match(text, /PLAN_SCAN_LIMIT_REACHED/);
  assert.match(text, /Daily scan limit reached for your plan\./);
  assert.match(text, /createdAt:\s*\{\s*gte:\s*dayStart,\s*lt:\s*dayEnd/s);
});

test("scan submit rate limit remains in place for scan submissions", async () => {
  const text = await source("src/app/actions/scans.ts");

  assert.match(text, /getRateLimitRuleForTier\(tier,\s*"scan_submit"\)/);
  assert.match(text, /action:\s*"scan_submit"/);
  assert.match(text, /checkRateLimit\(/);
});

test("new scan page includes helper copy and comparison toggle", async () => {
  const text = await source("src/components/scans/new-scan-form.tsx");

  assert.match(text, /Basic Scan runs quick automated checks/);
  assert.match(text, /Professional Scan creates a client-ready report/);
  assert.match(text, /Basic vs Professional Scan/);
  assert.match(text, /View full comparison/);
  assert.match(text, /Hide comparison/);
});

test("dashboard includes scan type explanation cards", async () => {
  const text = await source("src/app/dashboard/page.tsx");

  assert.match(text, /Choose the right scan type/);
  assert.match(text, /Basic Scan/);
  assert.match(text, /Professional Scan/);
  assert.match(text, /Quick automated website posture check/);
});

test("billing cards keep scan type and manual review wording with compact cards", async () => {
  const text = await source("src/app/dashboard/billing/page.tsx");

  assert.match(text, /Basic Scan only/);
  assert.match(text, /Professional Scan/);
  assert.match(text, /View full limits/);
  assert.match(text, /Requires an existing generated report\./);
  assert.match(text, /Deep manual reviews are sold separately\./);
  assert.equal(text.includes("Manual review support"), false);
});

test("basic scan hides professional-only sections and shows upgrade guidance", async () => {
  const text = await source("src/app/dashboard/scans/[id]/page.tsx");

  assert.match(text, /const isBasicScan = scanType === "BASIC"/);
  assert.match(text, /OWASP checklist is available in Professional Scan\./);
  assert.match(text, /Need OWASP checklist, professional PDF, branding, and share links\? Use Professional Scan\./);
  assert.match(text, /\{hasClientAccess && !isBasicScan/);
});

test("basic scan PDF generation is enabled with dedicated copy", async () => {
  const route = await source("src/app/api/scans/[id]/generate-report/route.ts");
  const page = await source("src/app/dashboard/scans/[id]/page.tsx");
  const actions = await source("src/components/reports/report-actions.tsx");

  assert.doesNotMatch(route, /scan\.scanType === "BASIC"/);
  assert.match(page, /Generate a basic PDF report from completed core scan results\./);
  assert.match(page, /Generate Basic PDF Report/);
  assert.match(actions, /generateLabel/);
  assert.match(actions, /No report credits available\./);
});

test("professional worker flow remains with OWASP builder logic", async () => {
  const text = await source("src/lib/scans/scanProcessor.ts");

  assert.match(text, /scanType === "PROFESSIONAL"/);
  assert.match(text, /OWASP checklist builder started/);
  assert.match(text, /OWASP checklist builder completed/);
});

test("sample report page includes basic vs professional comparison section", async () => {
  const text = await source("src/app/sample-report/page.tsx");

  assert.match(text, /Basic vs Professional Scan/);
  assert.match(text, /Basic overview/);
  assert.match(text, /Full priority summary/);
});
