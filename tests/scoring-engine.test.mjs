import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCategoryScores,
  calculateGrade,
  calculateRiskScore,
} from "../src/lib/security/scoringEngine.ts";

function finding(overrides) {
  return {
    category: "HTTP Security Headers",
    evidence: "Real scanner evidence.",
    fix: "Fix the issue.",
    severity: "MEDIUM",
    title: "Finding",
    ...overrides,
  };
}

test("empty findings returns score 100 and grade A", () => {
  const score = calculateRiskScore([]);

  assert.equal(score, 100);
  assert.equal(calculateGrade(score), "A");
});

test("one Critical finding deducts 25", () => {
  assert.equal(calculateRiskScore([finding({ severity: "CRITICAL" })]), 75);
});

test("one High finding deducts 15", () => {
  assert.equal(calculateRiskScore([finding({ severity: "HIGH" })]), 85);
});

test("one Medium finding deducts 8", () => {
  assert.equal(calculateRiskScore([finding({ severity: "MEDIUM" })]), 92);
});

test("one Low finding deducts 3", () => {
  assert.equal(calculateRiskScore([finding({ severity: "LOW" })]), 97);
});

test("one Info finding deducts 0", () => {
  assert.equal(calculateRiskScore([finding({ severity: "INFO" })]), 100);
});

test("multiple findings calculate correctly", () => {
  assert.equal(
    calculateRiskScore([
      finding({ severity: "CRITICAL" }),
      finding({ severity: "HIGH" }),
      finding({ severity: "MEDIUM" }),
      finding({ severity: "LOW" }),
      finding({ severity: "INFO" }),
    ]),
    49,
  );
});

test("score never goes below 0", () => {
  const findings = Array.from({ length: 10 }, () =>
    finding({ severity: "CRITICAL" }),
  );

  assert.equal(calculateRiskScore(findings), 0);
});

test("grade boundaries", () => {
  assert.equal(calculateGrade(100), "A");
  assert.equal(calculateGrade(90), "A");
  assert.equal(calculateGrade(89), "B");
  assert.equal(calculateGrade(75), "B");
  assert.equal(calculateGrade(74), "C");
  assert.equal(calculateGrade(60), "C");
  assert.equal(calculateGrade(59), "D");
  assert.equal(calculateGrade(40), "D");
  assert.equal(calculateGrade(39), "F");
  assert.equal(calculateGrade(0), "F");
});

test("category scores calculate independently", () => {
  const categories = calculateCategoryScores([
    finding({
      category: "HTTP Security Headers",
      severity: "HIGH",
      title: "Missing Content-Security-Policy header",
    }),
    finding({
      category: "SSL/TLS",
      severity: "LOW",
      title: "HTTP does not redirect to HTTPS",
    }),
  ]);

  assert.equal(
    categories.find((category) => category.category === "HTTP Security Headers")
      ?.score,
    85,
  );
  assert.equal(
    categories.find((category) => category.category === "SSL/TLS")?.score,
    97,
  );
  assert.equal(
    categories.find((category) => category.category === "Email Security")?.score,
    100,
  );
});

test("INFO observation Domain appears configured not to receive mail deducts 0", () => {
  assert.equal(
    calculateRiskScore([
      finding({
        category: "Email Security",
        severity: "INFO",
        title: "Domain appears configured not to receive mail",
      }),
    ]),
    100,
  );
});

test("inconclusive public path observations do not affect score", () => {
  assert.equal(
    calculateRiskScore([
      finding({
        category: "Technology Detection",
        evidence: "Public path check was inconclusive.",
        severity: "LOW",
        title: "Inconclusive public path observation",
      }),
    ]),
    100,
  );
});

test("OWASP NOT_CHECKED categories do not affect score", () => {
  assert.equal(
    calculateRiskScore([
      finding({
        category: "OWASP Checklist",
        evidence: "Current scanner does not test this category.",
        severity: "LOW",
        title: "Injection NOT_CHECKED",
      }),
    ]),
    100,
  );
});

test("false Technology Detection observations are not included in score", () => {
  assert.equal(
    calculateRiskScore([
      finding({
        category: "Technology Detection",
        evidence: "/xmlrpc.php responded with HTTP 404.",
        severity: "MEDIUM",
        title: "XML-RPC NOT_CHECKED path observation",
      }),
      finding({
        category: "Technology Detection",
        evidence:
          "Path returned HTTP 200, but no product-specific exposure indicators were found.",
        severity: "LOW",
        title: "Generic inconclusive public path observation",
      }),
    ]),
    100,
  );
});
