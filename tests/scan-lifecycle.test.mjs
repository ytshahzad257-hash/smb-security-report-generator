import assert from "node:assert/strict";
import test from "node:test";

import {
  createCompletedScanUpdate,
  createFailedScanUpdate,
  createRunningScanUpdate,
  getSafeScanErrorMessage,
  ScanProcessingError,
  shouldMarkScanFailed,
} from "../src/lib/scans/scanLifecycle.ts";

test("createRunningScanUpdate marks a scan running", () => {
  const now = new Date("2026-05-13T00:00:00.000Z");

  assert.deepEqual(createRunningScanUpdate(now), {
    status: "RUNNING",
    startedAt: now,
    completedAt: null,
    errorMessage: null,
  });
});

test("createCompletedScanUpdate completes without score or grade", () => {
  const now = new Date("2026-05-13T00:01:00.000Z");

  assert.deepEqual(createCompletedScanUpdate(now), {
    status: "COMPLETED",
    completedAt: now,
    score: null,
    grade: null,
    errorMessage: null,
  });
});

test("createFailedScanUpdate saves a safe error message", () => {
  const now = new Date("2026-05-13T00:02:00.000Z");
  const error = new ScanProcessingError("Redis queue unavailable.\nRetry later.");

  assert.deepEqual(createFailedScanUpdate(error, now), {
    status: "FAILED",
    completedAt: now,
    errorMessage: "Redis queue unavailable. Retry later.",
  });
});

test("generic errors use a safe failure message", () => {
  assert.equal(
    getSafeScanErrorMessage(new Error("internal stack detail")),
    "The scan worker could not complete this job safely.",
  );
});

test("ownership errors can opt out of scan failure updates", () => {
  const error = new ScanProcessingError("Scan owner mismatch.", {
    markScanFailed: false,
  });

  assert.equal(shouldMarkScanFailed(error), false);
});
