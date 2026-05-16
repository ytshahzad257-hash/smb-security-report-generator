import assert from "node:assert/strict";
import test from "node:test";

import {
  clientInputSchema,
  validateClientInput,
} from "../src/lib/clients/clientValidation.ts";
import {
  SHARE_DISCLAIMER,
  generateShareToken,
  getShareExpiry,
  isShareExpired,
  parseReportShareInput,
} from "../src/lib/reports/reportSharing.ts";

test("client validation accepts a valid client", () => {
  const result = validateClientInput({
    companyName: "Acme Co.",
    contactEmail: "security@acme.test",
    name: "Acme",
    notes: "Priority account",
    phone: "+1 555 0100",
    website: "https://acme.test",
  });

  assert.equal(result.success, true);
});

test("client validation rejects invalid email", () => {
  const result = validateClientInput({
    contactEmail: "not-an-email",
    name: "Acme",
  });

  assert.equal(result.success, false);
});

test("client validation rejects invalid website URL", () => {
  const result = validateClientInput({
    name: "Acme",
    website: "javascript:alert(1)",
  });

  assert.equal(result.success, false);
});

test("client validation enforces required name length", () => {
  const result = clientInputSchema.safeParse({
    name: "A",
  });

  assert.equal(result.success, false);
});

test("share token is long and unguessable-looking", () => {
  const first = generateShareToken();
  const second = generateShareToken();

  assert.notEqual(first, second);
  assert.equal(first.length >= 40, true);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
});

test("share parser requires custom expiration to be in the future", () => {
  assert.throws(
    () =>
      parseReportShareInput({
        customExpiresAt: "2026-01-01T00:00",
        expiresIn: "custom",
      }),
    /future|Expiration/,
  );
});

test("share expiry supports never and fixed day windows", () => {
  assert.equal(getShareExpiry({ customExpiresAt: null, expiresIn: "never" }), null);

  const sevenDays = getShareExpiry({ customExpiresAt: null, expiresIn: "7" });

  assert.notEqual(sevenDays, null);
  assert.equal(sevenDays.getTime() > Date.now(), true);
});

test("expired share check blocks old dates", () => {
  assert.equal(isShareExpired(new Date("2026-01-01T00:00:00.000Z")), true);
  assert.equal(isShareExpired(null), false);
});

test("public share disclaimer includes required limitations", () => {
  assert.match(SHARE_DISCLAIMER, /automated safe checks only/i);
  assert.match(SHARE_DISCLAIMER, /not a penetration test/i);
  assert.match(SHARE_DISCLAIMER, /security certification/i);
  assert.match(SHARE_DISCLAIMER, /full OWASP compliance audit/i);
});

test("public share disclaimer does not claim certification or that a site is secure", () => {
  const lower = SHARE_DISCLAIMER.toLowerCase();

  assert.equal(lower.includes("owasp compliant"), false);
  assert.equal(lower.includes("website is secure"), false);
  assert.equal(lower.includes("security certified"), false);
});
