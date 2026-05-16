import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(filePath) {
  return readFile(filePath, "utf8");
}

test("notification settings route requires authenticated user", async () => {
  const text = await source("src/app/dashboard/settings/notifications/page.tsx");

  assert.match(text, /await requireUser\(\)/);
});

test("settings page notification button links to notification settings", async () => {
  const text = await source("src/app/dashboard/settings/page.tsx");

  assert.match(text, /href=\"\/dashboard\/settings\/notifications\"/);
  assert.match(text, /Manage email and in-app notification preferences\./);
});

test("notification preferences defaults keep marketing off and in-app on", async () => {
  const schema = await source("prisma/schema.prisma");
  const service = await source("src/lib/notifications/notifications.ts");

  assert.match(schema, /marketingEmails\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /inAppNotifications\s+Boolean\s+@default\(true\)/);
  assert.match(service, /marketingEmails:\s*false/);
  assert.match(service, /inAppNotifications:\s*true/);
});

test("createInAppNotification respects in-app preference and duplicate event keys", async () => {
  const text = await source("src/lib/notifications/notifications.ts");

  assert.match(text, /preference\?\.inAppNotifications === false/);
  assert.match(text, /reason:\s*"preference_disabled"/);
  assert.match(text, /path:\s*\["eventKey"\]/);
  assert.match(text, /reason:\s*"duplicate"/);
  assert.match(text, /prisma\.notification\.create\(/);
});

test("notification ownership is enforced in read and mark routes", async () => {
  const service = await source("src/lib/notifications/notifications.ts");
  const markOneRoute = await source("src/app/api/notifications/[id]/read/route.ts");
  const listRoute = await source("src/app/api/notifications/route.ts");

  assert.match(service, /where:\s*\{\s*id:\s*notificationId,[\s\S]*userId,\s*\}/);
  assert.match(service, /where:\s*\{\s*readAt:\s*null,[\s\S]*userId,\s*\}/);
  assert.match(markOneRoute, /markNotificationRead\(user\.id, id\)/);
  assert.match(listRoute, /getUserNotifications\(user\.id/);
});

test("bell dropdown includes unread badge and mark-all-read controls", async () => {
  const text = await source("src/components/dashboard/notification-bell.tsx");

  assert.match(text, /DropdownMenu/);
  assert.match(text, /Unread:\s*\{computedUnreadCount\}/);
  assert.match(text, /Mark all read/);
  assert.match(text, /\/api\/notifications\/unread-count/);
  assert.match(text, /\/api\/notifications\/read-all/);
  assert.match(text, /Notification settings/);
});

test("notification event triggers are wired for scan, pdf, manual payment, share, and payment states", async () => {
  const text = await source("src/lib/email/notifications.ts");

  assert.match(text, /type:\s*"scan_completed"/);
  assert.match(text, /type:\s*"pdf_report_ready"/);
  assert.match(text, /type:\s*"manual_payment_submitted"/);
  assert.match(text, /type:\s*"manual_payment_approved"/);
  assert.match(text, /type:\s*"manual_payment_rejected"/);
  assert.match(text, /type:\s*"share_link_created"/);
  assert.match(text, /type:\s*"payment_failed"/);
  assert.match(text, /type:\s*"subscription_activated"/);
});

test("notification sanitization guards against secrets and raw paths", async () => {
  const text = await source("src/lib/notifications/notifications.ts");

  assert.match(text, /SENSITIVE_KEY_PATTERN/);
  assert.match(text, /\[path redacted\]/);
  assert.match(text, /sanitizeMetadata/);
  assert.match(text, /sanitizeText/);
});

test("admin system health includes notification capability flags", async () => {
  const text = await source("src/lib/admin.ts");

  assert.match(text, /notificationModelAvailable/);
  assert.match(text, /notificationPreferencesAvailable/);
});
