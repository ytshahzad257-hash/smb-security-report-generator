import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readSource(filePath) {
  return readFile(filePath, "utf8");
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return listFiles(entryPath);
      }

      return entryPath;
    }),
  );

  return files.flat();
}

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);

  return source.slice(startIndex, endIndex);
}

test("normal billing page has no development plan activation UI", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");
  const forbiddenComponent = ["Dev", "Plan", "Activation"].join("");
  const forbiddenLabel = ["Activate", " Plan", " for", " Testing"].join("");
  const forbiddenEyebrow = ["Development", " only"].join("");

  assert.doesNotMatch(source, new RegExp(forbiddenComponent));
  assert.doesNotMatch(source, new RegExp(forbiddenLabel));
  assert.doesNotMatch(source, new RegExp(forbiddenEyebrow));
});

test("normal billing page hides internal Stripe and Lemon provider fields", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");

  assert.doesNotMatch(source, /Stripe customer|Stripe subscription/);
  assert.doesNotMatch(source, /Lemon customer|Lemon subscription/);
  assert.doesNotMatch(source, /providerEventId|stripeCustomerId|lemonCustomerId/);
  assert.doesNotMatch(source, /Stripe kept for future|Stripe disabled/);
});

test("billing page uses one unified payment history section", async () => {
  const source = await readSource("src/app/dashboard/billing/page.tsx");

  assert.match(source, /Payment History/);
  assert.doesNotMatch(source, /Recent payments/);
  assert.doesNotMatch(source, /Payment request history/);
});

test("no billing API route or server action exposes direct paid entitlement changes", async () => {
  const files = [
    ...(await listFiles("src/app/api")),
    ...(await listFiles("src/app/actions")),
  ].filter((filePath) => /\.(ts|tsx)$/.test(filePath));
  const directAction = ["activate", "Plan", "For", "Testing"].join("");
  const directHelper = ["activate", "Plan", "For", "User"].join("");

  for (const filePath of files) {
    const source = await readSource(filePath);

    assert.doesNotMatch(source, new RegExp(directAction), filePath);
    assert.doesNotMatch(source, new RegExp(directHelper), filePath);
  }
});

test("removed billing test component cannot be bundled in production", async () => {
  const componentPath = path.join(
    "src",
    "components",
    "billing",
    ["dev", "plan", "activation.tsx"].join("-"),
  );

  await assert.rejects(stat(componentPath), { code: "ENOENT" });
});

test("manual payment request creation stays pending and does not grant entitlements", async () => {
  const source = await readSource("src/lib/manual-payments.ts");
  const createRequestSource = between(
    source,
    "export async function createManualPaymentRequest",
    "export async function cancelManualPaymentRequest",
  );

  assert.match(createRequestSource, /status:\s*"PENDING"/);
  assert.doesNotMatch(createRequestSource, /subscription\.(create|update|updateMany)/);
  assert.doesNotMatch(createRequestSource, /creditsRemaining:\s*\{\s*increment/);
});

test("admin manual payment approval grants entitlements and writes an audit log", async () => {
  const source = await readSource("src/lib/manual-payments.ts");
  const approvalSource = between(
    source,
    "export async function approveManualPaymentRequest",
    "export async function rejectManualPaymentRequest",
  );

  assert.match(approvalSource, /subscription\.create/);
  assert.match(approvalSource, /creditsRemaining:\s*\{\s*increment/);
  assert.match(approvalSource, /adminAuditLog\.createMany/);
  assert.match(approvalSource, /"PLAN_ACTIVATED"/);
  assert.match(approvalSource, /"CREDITS_ADDED"/);
});

test("checkout success redirects do not activate plans or credits", async () => {
  const files = [
    "src/app/dashboard/billing/success/page.tsx",
    "src/app/dashboard/billing/page.tsx",
    "src/app/api/billing/stripe/checkout/route.ts",
    "src/app/api/billing/lemon/checkout/route.ts",
  ];
  const directHelper = ["activate", "Plan", "For", "User"].join("");

  for (const filePath of files) {
    const source = await readSource(filePath);

    assert.doesNotMatch(source, new RegExp(directHelper), filePath);
    assert.doesNotMatch(source, /creditsRemaining:\s*\{\s*increment/, filePath);
    assert.doesNotMatch(source, /subscription\.create/, filePath);
  }
});

test("admin credit adjustment requires a reason and writes an audit log", async () => {
  const routeSource = await readSource("src/app/api/admin/users/[id]/credits/route.ts");
  const adminSource = await readSource("src/lib/admin.ts");
  const adjustmentSource = between(
    adminSource,
    "export async function adjustUserCredits",
    "export async function changeUserStatus",
  );

  assert.match(routeSource, /reason:\s*z\.string\(\)\.trim\(\)\.min\(3\)/);
  assert.match(adjustmentSource, /reason:\s*string/);
  assert.match(adjustmentSource, /adminAuditLog\.create/);
  assert.match(adjustmentSource, /"CREDITS_ADJUSTED"/);
});
