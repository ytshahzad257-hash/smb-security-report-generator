import assert from "node:assert/strict";
import test from "node:test";

import { getEmailHealthChecks } from "../src/lib/email/emailConfig.ts";
import { emailTemplates } from "../src/lib/email/emailTemplates.ts";
import { sendEmail } from "../src/lib/email/sendEmail.ts";

function withEmailEnv(env, callback) {
  const keys = [
    "EMAIL_PROVIDER",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM_NAME",
    "SMTP_FROM_EMAIL",
    "SUPPORT_EMAIL",
    "ADMIN_NOTIFICATION_EMAIL",
  ];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }

  Object.assign(process.env, env);

  return Promise.resolve(callback()).finally(() => {
    for (const key of keys) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });
}

test("sendEmail returns skipped when SMTP config is missing", async () => {
  await withEmailEnv({}, async () => {
    const result = await sendEmail({
      template: emailTemplates.scanCompletedUser({
        domain: "example.com",
        findingsCount: 2,
        grade: "B",
        score: 84,
      }),
      templateKey: "scan.completed.user",
      to: "user@example.com",
    });

    assert.equal(result.status, "SKIPPED");
    assert.equal(result.success, false);
  });
});

test("console email provider does not require SMTP credentials", async () => {
  await withEmailEnv({ EMAIL_PROVIDER: "console" }, async () => {
    const originalInfo = console.info;
    const messages = [];
    console.info = (...args) => {
      messages.push(args.map(String).join(" "));
    };

    let result;
    try {
      result = await sendEmail({
        template: emailTemplates.paymentFailedUser({
          packageName: "Agency Pro",
          provider: "STRIPE",
        }),
        templateKey: "payment.failed.user",
        to: "user@example.com",
      });
    } finally {
      console.info = originalInfo;
    }

    assert.equal(result.status, "SENT");
    assert.equal(result.success, true);
    assert.equal(messages.some((message) => message.includes("[email:console]")), true);
    assert.equal(messages.some((message) => /SMTP_PASSWORD|password=/i.test(message)), false);
  });
});

test("email health checks never expose SMTP password", () => {
  const health = getEmailHealthChecks();

  assert.equal(Object.keys(health).includes("smtpPasswordConfigured"), false);
  assert.equal(Object.keys(health).includes("SMTP_PASSWORD"), false);
  assert.equal(Object.keys(health).includes("emailProviderConfigured"), true);
});

test("admin test template is notification-only", () => {
  const template = emailTemplates.adminTestEmail({
    adminEmail: "admin@example.com",
    provider: "console",
  });

  assert.match(template.text, /development\/admin test/i);
  assert.match(template.text, /does not activate plans, credits, payments, scans, reports, or share links/i);
  assert.equal(template.text.includes("SMTP_PASSWORD"), false);
});

test("share template does not expose raw share passwords", () => {
  const template = emailTemplates.reportShareCreatedUser({
    clientName: "Acme",
    domain: "example.com",
    expiresAt: null,
    title: "Security report",
  });

  assert.match(template.text, /Passwords are never included/i);
  assert.equal(template.text.includes("secret-password"), false);
  assert.equal(template.html.includes("secret-password"), false);
});

test("PDF failure admin template avoids raw paths and stack traces", () => {
  const template = emailTemplates.pdfGenerationFailedAdmin({
    errorSummary: "PDF generation failed",
    scanTarget: "example.com",
    userEmail: "user@example.com",
  });

  assert.equal(template.text.includes("E:\\"), false);
  assert.equal(template.text.includes("at render"), false);
  assert.match(template.text, /Stack traces, raw file paths/);
});
