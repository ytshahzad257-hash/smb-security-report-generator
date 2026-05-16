import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  sampleFindings,
  sampleReportData,
  sampleReportDisclaimer,
} from "../src/lib/reports/sampleReportData.ts";

async function readSource(filePath) {
  return readFile(filePath, "utf8");
}

test("/sample-report page is public and does not require login", async () => {
  const source = await readSource("src/app/sample-report/page.tsx");

  assert.doesNotMatch(source, /requireUser|getCurrentUser|redirect\(/);
  assert.match(source, /export default function SampleReportPage/);
});

test("sample report uses static demo data and labels every finding", () => {
  assert.equal(sampleReportData.scan.rootDomain, "example-business.com");
  assert.equal(sampleReportData.scan.id, "sample-demo-report");

  for (const finding of sampleFindings) {
    assert.match(finding.title, /SAMPLE\/DEMO/);
    assert.match(`${finding.evidence} ${finding.fix}`, /SAMPLE\/DEMO/);
  }
});

test("sample page contains the required demo disclaimer", async () => {
  const source = await readSource("src/app/sample-report/page.tsx");

  assert.match(source, /sampleReportDisclaimer/);
  assert.match(
    sampleReportDisclaimer,
    /This is a sample report based on demo data/,
  );
  assert.match(sampleReportDisclaimer, /not a penetration test/i);
  assert.match(sampleReportDisclaimer, /not.*security certification/i);
  assert.match(sampleReportDisclaimer, /not.*full OWASP compliance audit/i);
});

test("sample page and PDF route do not query private reports or scans", async () => {
  const pageSource = await readSource("src/app/sample-report/page.tsx");
  const routeSource = await readSource("src/app/sample-report/download/route.ts");
  const combined = `${pageSource}\n${routeSource}`;

  assert.doesNotMatch(combined, /getPrisma|prisma\.|buildReportData/);
  assert.doesNotMatch(combined, /report\.find|scan\.find|shareToken|token/);
  assert.doesNotMatch(combined, /REPORTS_PUBLIC_DIR|generated-reports/);
});

test("sample page and PDF route do not deduct or grant credits", async () => {
  const pageSource = await readSource("src/app/sample-report/page.tsx");
  const routeSource = await readSource("src/app/sample-report/download/route.ts");
  const combined = `${pageSource}\n${routeSource}`;

  assert.doesNotMatch(combined, /deductCredit|creditsRemaining|creditsUsed/);
  assert.doesNotMatch(combined, /credits:\s*\{|creditsRemaining:\s*\{/);
  assert.doesNotMatch(combined, /subscription\.create|subscription\.update/);
});

test("sample PDF is generated only from static sample data", async () => {
  const routeSource = await readSource("src/app/sample-report/download/route.ts");

  assert.match(routeSource, /sampleReportData/);
  assert.match(routeSource, /renderReportHtml/);
  assert.match(routeSource, /generatePdfFromHtml/);
  assert.doesNotMatch(routeSource, /params|cookies\(|headers\(|Request/);
});

test("sample public sources do not expose obvious secrets or local file paths", async () => {
  const pageSource = await readSource("src/app/sample-report/page.tsx");
  const routeSource = await readSource("src/app/sample-report/download/route.ts");
  const dataSource = await readSource("src/lib/reports/sampleReportData.ts");
  const combined = `${pageSource}\n${routeSource}\n${dataSource}`;

  assert.doesNotMatch(combined, /E:\\|file:\/\/|DATABASE_URL|API_KEY|SECRET/);
  assert.doesNotMatch(combined, /shareToken|password|privateKey/);
});
