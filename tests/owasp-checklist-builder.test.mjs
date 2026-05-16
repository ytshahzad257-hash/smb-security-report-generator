import assert from "node:assert/strict";
import test from "node:test";

import { buildOwaspChecklist } from "../src/lib/scanners/owaspChecklistBuilder.ts";

function finding(overrides) {
  return {
    category: "HTTP Security Headers",
    confidence: "HIGH",
    evidence: "Evidence from a completed scanner.",
    fix: "Apply the recommended fix.",
    impact: "Potential security impact.",
    owaspMapping: "Security Misconfiguration",
    scanId: "scan_1",
    severity: "MEDIUM",
    title: "Missing Content-Security-Policy header",
    ...overrides,
  };
}

function checklistWith(findings, completedModules = {}) {
  return buildOwaspChecklist({
    completedModules: {
      emailSecurity: true,
      httpHeaders: true,
      sslTls: true,
      techDetection: true,
      ...completedModules,
    },
    findings,
    scanId: "scan_1",
  });
}

function item(result, categoryName) {
  return result.checklistItems.find(
    (checklistItem) => checklistItem.categoryName === categoryName,
  );
}

test("Security Misconfiguration becomes ATTENTION_REQUIRED when HTTP header findings exist", () => {
  const result = checklistWith([
    finding({
      category: "HTTP Security Headers",
      title: "Missing Content-Security-Policy header",
    }),
  ]);

  const checklistItem = item(result, "Security Misconfiguration");

  assert.equal(checklistItem?.status, "ATTENTION_REQUIRED");
  assert.equal(checklistItem?.relatedFindings.length, 1);
});

test("Cryptographic Failures becomes ATTENTION_REQUIRED when SSL/TLS or HSTS findings exist", () => {
  const result = checklistWith([
    finding({
      category: "SSL/TLS",
      owaspMapping: "Cryptographic Failures",
      title: "HTTP does not redirect to HTTPS",
    }),
  ]);

  const checklistItem = item(result, "Cryptographic Failures");

  assert.equal(checklistItem?.status, "ATTENTION_REQUIRED");
  assert.match(checklistItem?.evidenceSummary ?? "", /HTTP does not redirect/);
});

test("Injection remains NOT_CHECKED", () => {
  const result = checklistWith([]);

  assert.equal(item(result, "Injection")?.status, "NOT_CHECKED");
});

test("SSRF remains NOT_CHECKED for target app vulnerabilities", () => {
  const result = checklistWith([]);
  const checklistItem = item(result, "Server-Side Request Forgery");

  assert.equal(checklistItem?.status, "NOT_CHECKED");
  assert.match(checklistItem?.evidenceSummary ?? "", /Not checked for target app/);
});

test("DKIM low-confidence finding maps to Identification/Auth as OBSERVATION", () => {
  const result = checklistWith([
    finding({
      category: "Email Security",
      confidence: "LOW",
      owaspMapping:
        "Identification and Authentication Failures / Security Misconfiguration",
      severity: "INFO",
      title: "No DKIM record found for common selectors tested",
    }),
  ]);

  const checklistItem = item(
    result,
    "Identification and Authentication Failures",
  );

  assert.equal(checklistItem?.status, "OBSERVATION");
  assert.equal(checklistItem?.relatedFindings.length, 1);
});

test("Checklist does not create fake findings for not checked categories", () => {
  const result = checklistWith([]);
  const notCheckedItems = result.checklistItems.filter(
    (checklistItem) => checklistItem.status === "NOT_CHECKED",
  );

  assert.equal(result.checklistItems.length, 10);
  assert.equal(
    notCheckedItems.every(
      (checklistItem) => checklistItem.relatedFindings.length === 0,
    ),
    true,
  );
});

test("Remediation summary groups findings by severity", () => {
  const result = checklistWith([
    finding({
      category: "Technology Detection",
      severity: "HIGH",
      title: ".git directory appears accessible",
    }),
    finding({
      category: "Technology Detection",
      severity: "LOW",
      title: "Server version exposed in response header",
    }),
    finding({
      category: "Email Security",
      severity: "INFO",
      title: "No DKIM record found for common selectors tested",
    }),
  ]);

  assert.deepEqual(
    result.remediationSummary.immediateAttention.map((summary) => summary.title),
    [".git directory appears accessible"],
  );
  assert.deepEqual(
    result.remediationSummary.recommendedHardening.map(
      (summary) => summary.title,
    ),
    ["Server version exposed in response header"],
  );
  assert.deepEqual(
    result.remediationSummary.informationalObservations.map(
      (summary) => summary.title,
    ),
    ["No DKIM record found for common selectors tested"],
  );
});
