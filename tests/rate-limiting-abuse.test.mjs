import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PLAN_LIMITS,
  getLimitTierForPlanSlug,
} from "../src/lib/security/limits.ts";
import {
  checkRateLimit,
  createRateLimitKey,
  getRateLimiterHealth,
  resetMemoryRateLimitsForTests,
} from "../src/lib/security/rateLimit.ts";

async function source(filePath) {
  return readFile(filePath, "utf8");
}

function between(text, start, end) {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);

  return text.slice(startIndex, endIndex);
}

test("scan submit rate limit blocks after configured limit", async () => {
  resetMemoryRateLimitsForTests();
  const originalRedisUrl = process.env.REDIS_URL;

  delete process.env.REDIS_URL;

  try {
    const key = createRateLimitKey({
      action: "scan_submit",
      ip: "203.0.113.10",
      route: "test",
      userId: "user-1",
    });
    const rule = { limit: 2, mode: "fixed", windowMs: 60_000 };

    assert.equal((await checkRateLimit({ ...rule, key })).allowed, true);
    assert.equal((await checkRateLimit({ ...rule, key })).allowed, true);

    const blocked = await checkRateLimit({ ...rule, key });

    assert.equal(blocked.allowed, false);
    assert.equal(blocked.limit, 2);
    assert.equal(blocked.remaining, 0);
    assert.equal(blocked.source, "memory");
  } finally {
    if (originalRedisUrl) {
      process.env.REDIS_URL = originalRedisUrl;
    }
    resetMemoryRateLimitsForTests();
  }
});

test("Redis unavailable or unconfigured does not crash local dev limiter", async () => {
  resetMemoryRateLimitsForTests();
  const originalRedisUrl = process.env.REDIS_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  delete process.env.REDIS_URL;
  process.env.NODE_ENV = "development";

  try {
    const result = await checkRateLimit({
      key: createRateLimitKey({ action: "proof_upload", ip: "198.51.100.8" }),
      limit: 1,
      mode: "sliding",
      windowMs: 60_000,
    });
    const health = await getRateLimiterHealth();

    assert.equal(result.allowed, true);
    assert.equal(result.source, "memory");
    assert.equal(health.rateLimiterRedisConfigured, false);
    assert.equal(health.rateLimiterInMemoryFallback, true);
  } finally {
    if (originalRedisUrl) {
      process.env.REDIS_URL = originalRedisUrl;
    }
    if (originalNodeEnv) {
      process.env.NODE_ENV = originalNodeEnv;
    }
    resetMemoryRateLimitsForTests();
  }
});

test("production without Redis fails closed instead of using memory fallback", async () => {
  resetMemoryRateLimitsForTests();
  const originalRedisUrl = process.env.REDIS_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  delete process.env.REDIS_URL;
  process.env.NODE_ENV = "production";

  try {
    const result = await checkRateLimit({
      key: createRateLimitKey({ action: "pdf_generate", userId: "user-1" }),
      limit: 10,
      mode: "sliding",
      windowMs: 60_000,
    });
    const health = await getRateLimiterHealth();

    assert.equal(result.allowed, false);
    assert.equal(result.source, "unavailable");
    assert.equal(health.rateLimiterInMemoryFallback, false);
    assert.equal(health.rateLimiterFailClosed, true);
  } finally {
    if (originalRedisUrl) {
      process.env.REDIS_URL = originalRedisUrl;
    }
    if (originalNodeEnv) {
      process.env.NODE_ENV = originalNodeEnv;
    }
    resetMemoryRateLimitsForTests();
  }
});

test("plan-based limits include required Phase 22 actions for every tier", () => {
  const requiredActions = [
    "scan_submit",
    "pdf_generate",
    "share_password_attempt",
    "share_download",
    "payment_request",
    "proof_upload",
    "admin_write",
    "test_email",
  ];

  for (const [tier, actions] of Object.entries(PLAN_LIMITS)) {
    for (const action of requiredActions) {
      assert.equal(typeof actions[action]?.limit, "number", `${tier}.${action}`);
      assert.equal(actions[action].windowMs > 0, true, `${tier}.${action}`);
    }
  }

  assert.equal(getLimitTierForPlanSlug("basic-report"), "BASIC_REPORT");
  assert.equal(getLimitTierForPlanSlug("agency-pro"), "AGENCY_PRO");
  assert.equal(getLimitTierForPlanSlug("basic-report", "ADMIN"), "ADMIN");
});

test("abuse metadata sanitizer removes secrets, paths, tokens, and raw payloads", async () => {
  const text = await source("src/lib/security/abuseLog.ts");

  assert.match(text, /sensitiveKeyPattern/);
  assert.match(text, /PLAN_PDF_ACCESS_BLOCKED/);
  assert.match(text, /authorization\|body\|cookie\|hash\|key\|password\|path\|payload\|raw\|secret\|signature\|token/);
  assert.match(text, /bearer\|basic/);
  assert.match(text, /\[path redacted\]/);
  assert.match(text, /safeAbuseMetadata/);
});

test("unsafe share token targets are stored as hashes", async () => {
  const text = await source("src/lib/security/abuseLog.ts");

  assert.match(text, /hash:\$\{hashRateLimitPart\(trimmed\)\}/);
  assert.match(text, /\^\[a-zA-Z0-9_-\]\{20,\}\$/);
});

test("PDF generation route rate limits before report generation", async () => {
  const text = await source("src/app/api/scans/[id]/generate-report/route.ts");
  const limitBlock = between(text, "const limit = await checkRateLimit", "const result = await generateReportForScan");

  assert.match(limitBlock, /PDF_RATE_LIMIT_TRIGGERED/);
  assert.match(limitBlock, /status:\s*429/);
  assert.doesNotMatch(limitBlock, /deductReportCredit|deductCredit/);
});

test("PDF generation route maps plan-block and completion errors with clear user-safe responses", async () => {
  const text = await source("src/app/api/scans/[id]/generate-report/route.ts");

  assert.match(text, /PLAN_ACCESS_DENIED/);
  assert.match(text, /Scan must be completed before generating PDF\./);
  assert.match(text, /PDF generation is temporarily rate-limited\./);
});

test("manual payment requests block duplicate pending option and rate-limit proof uploads", async () => {
  const actionText = await source("src/app/actions/billing.ts");
  const libText = await source("src/lib/manual-payments.ts");

  assert.match(actionText, /findPendingManualPaymentRequestForOption/);
  assert.match(actionText, /PAYMENT_PROOF_RATE_LIMIT/);
  assert.match(actionText, /Too many proof upload attempts/);
  assert.match(libText, /status:\s*"PENDING"/);
  assert.match(libText, /A pending request already exists/);
});

test("share password failures and public downloads are server-side rate-limited", async () => {
  const passwordRoute = await source("src/app/share/report/[token]/verify-password/route.ts");
  const downloadRoute = await source("src/app/share/report/[token]/download/route.ts");

  assert.match(passwordRoute, /share_password_attempt/);
  assert.match(passwordRoute, /SHARE_PASSWORD_RATE_LIMIT/);
  assert.match(passwordRoute, /url\.searchParams\.set\("error", "invalid"\)/);
  assert.doesNotMatch(passwordRoute, /password.*console|console.*password/);
  assert.match(downloadRoute, /share_download/);
  assert.match(downloadRoute, /status:\s*429/);
});

test("normal users are blocked and logged on admin API access", async () => {
  const adminText = await source("src/lib/admin.ts");
  const authText = await source("src/lib/auth.ts");

  assert.match(adminText, /user\.role !== "ADMIN"/);
  assert.match(authText, /UNAUTHORIZED_ADMIN_ACCESS/);
  assert.match(adminText, /status:\s*403/);
});

test("admin write API routes require admin auth and write rate limit", async () => {
  const files = [
    "src/app/api/admin/payments/[id]/approve/route.ts",
    "src/app/api/admin/payments/[id]/reject/route.ts",
    "src/app/api/admin/users/[id]/credits/route.ts",
    "src/app/api/admin/plans/[id]/route.ts",
    "src/app/api/admin/shares/[id]/revoke/route.ts",
    "src/app/api/admin/scans/[id]/retry/route.ts",
  ];

  for (const file of files) {
    const text = await source(file);

    assert.match(text, /requireAdminApi/, file);
    assert.match(text, /enforceAdminWriteRateLimit/, file);
  }
});

test("webhook duplicates are logged and invalid signatures are rate-limited without raw body exposure", async () => {
  const stripe = await source("src/app/api/stripe/webhook/route.ts");
  const lemon = await source("src/app/api/lemon/webhook/route.ts");

  for (const text of [stripe, lemon]) {
    assert.match(text, /WEBHOOK_REPLAY_BLOCKED/);
    assert.match(text, /webhook_invalid_signature/);
    assert.match(text, /status:\s*429/);
    assert.doesNotMatch(text, /rawBody:/);
  }
});

test("email notifications use dedupe keys for repeat-sensitive events", async () => {
  const text = await source("src/lib/email/notifications.ts");

  assert.match(text, /dedupeKey:\s*`manual-payment\.submitted\.user:\$\{request\.id\}`/);
  assert.match(text, /dedupeKey:\s*`scan\.completed:\$\{scan\.id\}`/);
  assert.match(text, /dedupeKey:\s*`pdf\.generated:\$\{report\.id\}`/);
  assert.match(text, /safeNotify/);
});

test("admin system health exposes booleans only and includes rate limiter status", async () => {
  const text = await source("src/lib/admin.ts");
  const rateLimitText = await source("src/lib/security/rateLimit.ts");

  assert.match(text, /getRateLimiterHealth/);
  assert.match(rateLimitText, /rateLimiterRedisConfigured/);
  assert.match(rateLimitText, /rateLimiterRedisConnected/);
  assert.match(text, /databaseUrlConfigured:\s*Boolean\(process\.env\.DATABASE_URL\)/);
  assert.doesNotMatch(text, /databaseUrl:\s*process\.env/i);
  assert.doesNotMatch(text, /redisUrl:\s*process\.env/i);
});

test("billing bypass remains absent from billing routes and actions", async () => {
  const files = [
    "src/app/dashboard/billing/page.tsx",
    "src/app/actions/billing.ts",
    "src/app/api/billing/stripe/checkout/route.ts",
    "src/app/api/billing/lemon/checkout/route.ts",
  ];

  for (const file of files) {
    const text = await source(file);

    assert.doesNotMatch(text, /activatePlanForTesting|activatePlanForUser/);
    assert.doesNotMatch(text, /subscription\.create\(/);
  }
});
