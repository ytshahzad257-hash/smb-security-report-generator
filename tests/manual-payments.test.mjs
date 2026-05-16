import assert from "node:assert/strict";
import test from "node:test";

import {
  getManualPaymentMethods,
  isPathInsidePaymentProofs,
  statusBadgeVariant,
  validateProofFile,
} from "../src/lib/manual-payments.ts";

test("validateProofFile accepts supported proof files", () => {
  const file = new File(["proof"], "receipt.png", { type: "image/png" });
  const result = validateProofFile(file);

  assert.equal(result.success, true);
  assert.equal(result.extension, "png");
});

test("validateProofFile rejects unsupported proof files", () => {
  const file = new File(["alert(1)"], "proof.js", {
    type: "application/javascript",
  });
  const result = validateProofFile(file);

  assert.equal(result.success, false);
  assert.match(result.error, /PNG, JPG, JPEG, WebP, or PDF/);
});

test("validateProofFile rejects oversized proof files", () => {
  const oversizedBytes = new Uint8Array(5 * 1024 * 1024 + 1);
  const file = new File([oversizedBytes], "proof.pdf", {
    type: "application/pdf",
  });
  const result = validateProofFile(file);

  assert.equal(result.success, false);
  assert.match(result.error, /5 MB or smaller/);
});

test("payment proof path guard blocks traversal outside proof storage", () => {
  assert.equal(isPathInsidePaymentProofs("..\\proof.pdf"), false);
});

test("manual payment methods are marked unconfigured when env details are missing", () => {
  const methods = getManualPaymentMethods();

  assert.equal(methods.some((method) => method.configured), false);
});

test("statusBadgeVariant maps manual payment states to UI variants", () => {
  assert.equal(statusBadgeVariant("PENDING"), "warning");
  assert.equal(statusBadgeVariant("APPROVED"), "success");
  assert.equal(statusBadgeVariant("REJECTED"), "destructive");
  assert.equal(statusBadgeVariant("CANCELLED"), "outline");
});
