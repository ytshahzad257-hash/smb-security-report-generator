import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { canUseWhiteLabelForPlan } from "../src/lib/billing-rules.ts";
import { canRemovePoweredByForPlan } from "../src/lib/agency/agencyAccess.ts";
import { validateAgencyProfileInput } from "../src/lib/agency/agencyValidation.ts";
import {
  AGENCY_ASSETS_PUBLIC_DIR,
  getAgencyLogoDataUri,
  validateLogoFile,
} from "../src/lib/agency/logoUpload.ts";

const validInput = {
  agencyName: "Acme Security",
  contactEmail: "reports@acme.test",
  footerText: "Prepared for client review",
  primaryColor: "#0f172a",
  secondaryColor: "#2563eb",
  showPoweredBy: true,
  websiteUrl: "https://acme.test",
};

test("Free plan cannot use white-label branding", () => {
  assert.equal(canUseWhiteLabelForPlan({ whiteLabelEnabled: false }), false);
});

test("Agency plan can use white-label branding", () => {
  assert.equal(canUseWhiteLabelForPlan({ whiteLabelEnabled: true }), true);
});

test("showPoweredBy=false only works for allowed plan", () => {
  assert.equal(
    canRemovePoweredByForPlan({
      manualReviewEnabled: false,
      name: "Agency Starter",
      slug: "agency-starter",
      whiteLabelEnabled: true,
    }),
    false,
  );
  assert.equal(
    canRemovePoweredByForPlan({
      manualReviewEnabled: true,
      name: "Agency Pro",
      slug: "agency-pro",
      whiteLabelEnabled: true,
    }),
    true,
  );
});

test("invalid color is rejected", () => {
  const result = validateAgencyProfileInput({
    ...validInput,
    primaryColor: "javascript:alert(1)",
  });

  assert.equal(result.success, false);
  assert.match(result.errors.primaryColor, /hex color/);
});

test("invalid email is rejected", () => {
  const result = validateAgencyProfileInput({
    ...validInput,
    contactEmail: "not-an-email",
  });

  assert.equal(result.success, false);
  assert.match(result.errors.contactEmail, /email/);
});

test("invalid website URL is rejected", () => {
  const result = validateAgencyProfileInput({
    ...validInput,
    websiteUrl: "javascript:alert(1)",
  });

  assert.equal(result.success, false);
  assert.match(result.errors.websiteUrl, /http/);
});

test("oversized logo upload is rejected", () => {
  const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "logo.png", {
    type: "image/png",
  });
  const result = validateLogoFile(file);

  assert.equal(result.success, false);
  assert.match(result.error, /2 MB/);
});

test("non-image logo upload is rejected", () => {
  const file = new File(["<script>alert(1)</script>"], "logo.html", {
    type: "text/html",
  });
  const result = validateLogoFile(file);

  assert.equal(result.success, false);
  assert.match(result.error, /PNG, JPG, JPEG, or WebP/);
});

test("agency logo data URI is built only from agency assets path", async () => {
  const userDir = path.join(AGENCY_ASSETS_PUBLIC_DIR, "test-user");
  const logoPath = path.join(userDir, "logo-test.png");
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );

  await mkdir(userDir, { recursive: true });
  await writeFile(logoPath, pngBytes);

  try {
    const dataUri = await getAgencyLogoDataUri(logoPath);

    assert.equal(dataUri?.startsWith("data:image/png;base64,"), true);
    assert.equal(await getAgencyLogoDataUri(path.join(process.cwd(), "logo-test.png")), null);
  } finally {
    await rm(userDir, { force: true, recursive: true });
  }
});
