import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSafeTargetUrl,
  checkRedirectSafety,
  isMetadataIp,
  isPrivateIp,
  normalizeUrl,
  UrlSafetyError,
  validateHttpUrl,
} from "../src/lib/security/urlSafety.ts";

test("normalizeUrl trims input and adds https", () => {
  assert.equal(normalizeUrl("  Example.COM/  "), "https://example.com");
});

test("block localhost", async () => {
  await assert.rejects(
    () => assertSafeTargetUrl("https://localhost"),
    UrlSafetyError,
  );
});

test("block private IPv4", () => {
  assert.equal(isPrivateIp("192.168.1.10"), true);
  assert.equal(isPrivateIp("10.0.0.2"), true);
  assert.equal(isPrivateIp("172.16.0.5"), true);
});

test("block private IPv6", () => {
  assert.equal(isPrivateIp("fc00::1"), true);
  assert.equal(isPrivateIp("fe80::1"), true);
});

test("block metadata IP", () => {
  assert.equal(isMetadataIp("169.254.169.254"), true);
});

test("block non-http protocols", () => {
  assert.throws(() => normalizeUrl("file:///etc/passwd"), UrlSafetyError);
  assert.throws(() => normalizeUrl("javascript:alert(1)"), UrlSafetyError);
  assert.throws(() => validateHttpUrl("ftp://example.com"), UrlSafetyError);
});

test("allow normal public HTTPS URL normalization", () => {
  assert.equal(normalizeUrl("https://example.com"), "https://example.com");
});

test("prevent redirect to unsafe URL", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(null, {
      status: 302,
      headers: {
        location: "http://127.0.0.1/admin",
      },
    });

  try {
    await assert.rejects(
      () => checkRedirectSafety("https://93.184.216.34"),
      UrlSafetyError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
