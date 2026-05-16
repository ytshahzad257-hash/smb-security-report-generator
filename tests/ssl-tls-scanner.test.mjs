import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeSslTls,
  calculateDaysUntilExpiry,
  scanSslTls,
} from "../src/lib/scanners/sslTlsScanner.ts";

function createSummary(overrides = {}) {
  return {
    authorizationError: null,
    certificateExists: true,
    certificateValid: true,
    checkedAt: "2026-05-13T00:00:00.000Z",
    daysUntilExpiry: 90,
    expired: false,
    hostnameMatched: true,
    httpRedirectFinalUrl: "https://example.com",
    httpRedirectsToHttps: true,
    httpRedirectStatusCode: 301,
    httpsAvailable: true,
    httpsError: null,
    issuer: "CN=Test Issuer",
    subject: "CN=example.com",
    subjectAltNames: ["DNS:example.com"],
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: "2026-08-11T00:00:00.000Z",
    ...overrides,
  };
}

function createCertificateResult(overrides = {}) {
  const summary = createSummary(overrides);

  return {
    authorizationError: summary.authorizationError,
    certificateExists: summary.certificateExists,
    certificateValid: summary.certificateValid,
    daysUntilExpiry: summary.daysUntilExpiry,
    expired: summary.expired,
    hostnameMatched: summary.hostnameMatched,
    httpsAvailable: summary.httpsAvailable,
    httpsError: summary.httpsError,
    issuer: summary.issuer,
    subject: summary.subject,
    subjectAltNames: summary.subjectAltNames,
    validFrom: summary.validFrom,
    validTo: summary.validTo,
  };
}

test("calculateDaysUntilExpiry returns whole days until expiry", () => {
  assert.equal(
    calculateDaysUntilExpiry(
      new Date("2026-02-01T00:00:00.000Z"),
      new Date("2026-01-23T00:00:00.000Z"),
    ),
    9,
  );
});

test("expired certificate creates a HIGH finding", () => {
  const findings = analyzeSslTls({
    scanId: "scan_1",
    sslSummary: createSummary({
      certificateValid: false,
      daysUntilExpiry: -1,
      expired: true,
      validTo: "2026-01-10T00:00:00.000Z",
    }),
  });
  const finding = findings.find(
    (item) => item.title === "TLS certificate is expired",
  );

  assert.equal(finding?.severity, "HIGH");
  assert.equal(finding?.owaspMapping, "Cryptographic Failures");
  assert.equal(finding?.evidence, "Certificate expired on 2026-01-10.");
});

test("certificate expiring within 14 days creates a MEDIUM finding", () => {
  const findings = analyzeSslTls({
    scanId: "scan_1",
    sslSummary: createSummary({
      certificateValid: true,
      daysUntilExpiry: 9,
      expired: false,
      validTo: "2026-02-01T00:00:00.000Z",
    }),
  });
  const finding = findings.find(
    (item) => item.title === "TLS certificate expires within 14 days",
  );

  assert.equal(finding?.severity, "MEDIUM");
  assert.equal(
    finding?.evidence,
    "Certificate expires in 9 days on 2026-02-01.",
  );
});

test("certificate expiring within 30 days creates a LOW finding", () => {
  const findings = analyzeSslTls({
    scanId: "scan_1",
    sslSummary: createSummary({
      certificateValid: true,
      daysUntilExpiry: 25,
      expired: false,
      validTo: "2026-02-17T00:00:00.000Z",
    }),
  });
  const finding = findings.find(
    (item) => item.title === "TLS certificate expires within 30 days",
  );

  assert.equal(finding?.severity, "LOW");
  assert.equal(
    finding?.evidence,
    "Certificate expires in 25 days on 2026-02-17.",
  );
});

test("HTTPS unavailable creates a HIGH finding", async () => {
  const result = await scanSslTls(
    {
      normalizedUrl: "https://example.com",
      rootDomain: "example.com",
      scanId: "scan_1",
      targetUrl: "https://example.com",
    },
    {
      certificateChecker: async () =>
        createCertificateResult({
          certificateExists: false,
          certificateValid: null,
          daysUntilExpiry: null,
          expired: null,
          hostnameMatched: null,
          httpsAvailable: false,
          httpsError:
            "HTTPS connection could not be established for the target host.",
          issuer: null,
          subject: null,
          subjectAltNames: [],
          validFrom: null,
          validTo: null,
        }),
      httpRedirectChecker: async () => ({
        finalUrl: null,
        redirectsToHttps: null,
        statusCode: null,
      }),
      validateSafeTarget: async () => undefined,
    },
  );
  const finding = result.findings.find(
    (item) => item.title === "HTTPS is not available",
  );

  assert.equal(result.sslSummary.httpsAvailable, false);
  assert.equal(finding?.severity, "HIGH");
  assert.equal(
    finding?.evidence,
    "HTTPS connection could not be established for the target host.",
  );
});

test("HTTP not redirecting to HTTPS creates a MEDIUM finding", async () => {
  const result = await scanSslTls(
    {
      normalizedUrl: "https://example.com",
      rootDomain: "example.com",
      scanId: "scan_1",
      targetUrl: "https://example.com",
    },
    {
      certificateChecker: async () => createCertificateResult(),
      httpRedirectChecker: async () => ({
        finalUrl: "http://example.com",
        redirectsToHttps: false,
        statusCode: 200,
      }),
      validateSafeTarget: async () => undefined,
    },
  );
  const finding = result.findings.find(
    (item) => item.title === "HTTP does not redirect to HTTPS",
  );

  assert.equal(result.sslSummary.httpRedirectsToHttps, false);
  assert.equal(finding?.severity, "MEDIUM");
  assert.equal(finding?.confidence, "HIGH");
  assert.equal(finding?.evidence, "HTTP did not redirect to HTTPS.");
});
