import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeHttpSecurityHeaders,
  getHeaderValue,
  scanHttpSecurityHeaders,
} from "../src/lib/scanners/httpHeadersScanner.ts";

function completeHeaderSet(overrides = {}) {
  return {
    "Content-Security-Policy": "default-src 'self'",
    "Strict-Transport-Security":
      "max-age=31536000; includeSubDomains; preload",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    ...overrides,
  };
}

function createFetch(headers, status = 200) {
  const responseHeaders = Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined),
  );

  return async () =>
    new Response("", {
      headers: responseHeaders,
      status,
    });
}

test("missing CSP creates a MEDIUM finding", async () => {
  const headers = completeHeaderSet({
    "Content-Security-Policy": undefined,
  });

  const result = await scanHttpSecurityHeaders(
    {
      normalizedUrl: "https://example.com",
      scanId: "scan_1",
    },
    {
      fetch: createFetch(headers),
      validateSafeTarget: async () => undefined,
    },
  );
  const finding = result.findings.find(
    (item) => item.title === "Missing Content-Security-Policy header",
  );

  assert.equal(finding?.severity, "MEDIUM");
  assert.equal(finding?.confidence, "HIGH");
  assert.equal(finding?.owaspMapping, "Security Misconfiguration");
  assert.match(finding?.evidence ?? "", /was not present/);
});

test("missing HSTS on HTTPS creates a MEDIUM finding", async () => {
  const headers = completeHeaderSet({
    "Strict-Transport-Security": undefined,
  });

  const result = await scanHttpSecurityHeaders(
    {
      normalizedUrl: "https://example.com",
      scanId: "scan_1",
    },
    {
      fetch: createFetch(headers),
      validateSafeTarget: async () => undefined,
    },
  );
  const finding = result.findings.find(
    (item) => item.title === "Missing Strict-Transport-Security header",
  );

  assert.equal(finding?.severity, "MEDIUM");
  assert.equal(
    finding?.owaspMapping,
    "Cryptographic Failures / Security Misconfiguration",
  );
  assert.match(finding?.evidence ?? "", /HTTPS response/);
});

test("wrong X-Content-Type-Options value creates a LOW finding", async () => {
  const result = await scanHttpSecurityHeaders(
    {
      normalizedUrl: "https://example.com",
      scanId: "scan_1",
    },
    {
      fetch: createFetch(
        completeHeaderSet({
          "X-Content-Type-Options": "sniff",
        }),
      ),
      validateSafeTarget: async () => undefined,
    },
  );
  const finding = result.findings.find(
    (item) => item.title === "X-Content-Type-Options has a weak value",
  );

  assert.equal(finding?.severity, "LOW");
  assert.equal(
    finding?.evidence,
    'X-Content-Type-Options value was "sniff", expected "nosniff".',
  );
});

test("header lookup is case-insensitive", () => {
  const headers = completeHeaderSet({
    "Content-Security-Policy": undefined,
    "content-security-policy": "default-src 'self'",
  });
  const analysis = analyzeHttpSecurityHeaders({
    finalUrl: "https://example.com",
    headers,
    scanId: "scan_1",
  });

  assert.equal(
    getHeaderValue(headers, "Content-Security-Policy"),
    "default-src 'self'",
  );
  assert.equal(
    analysis.headerSummary.find(
      (header) => header.name === "Content-Security-Policy",
    )?.status,
    "Present",
  );
  assert.equal(
    analysis.findings.some(
      (finding) => finding.title === "Missing Content-Security-Policy header",
    ),
    false,
  );
});

test("scanner handles fetch timeout safely", async () => {
  let validated = false;
  const fetchNeverCompletes = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  await assert.rejects(
    () =>
      scanHttpSecurityHeaders(
        {
          normalizedUrl: "https://example.com",
          scanId: "scan_1",
        },
        {
          fetch: fetchNeverCompletes,
          timeoutMilliseconds: 5,
          validateSafeTarget: async () => {
            validated = true;
          },
        },
      ),
    /timed out/,
  );
  assert.equal(validated, true);
});
