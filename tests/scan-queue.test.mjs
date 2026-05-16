import assert from "node:assert/strict";
import test from "node:test";

import {
  addScanJob,
  buildScanJobData,
  SCAN_JOB_NAME,
  scanJobOptions,
} from "../src/lib/queue/scanQueue.ts";

test("buildScanJobData creates the queue payload", () => {
  assert.deepEqual(
    buildScanJobData("scan_1", "user_1", "https://example.com", "BASIC"),
    {
      scanId: "scan_1",
      scanType: "BASIC",
      userId: "user_1",
      targetUrl: "https://example.com",
    },
  );
});

test("addScanJob enqueues with Phase 6 job options", async () => {
  const calls = [];
  const queue = {
    async add(name, data, options) {
      calls.push({ name, data, options });
      return { id: "job_1" };
    },
  };

  await addScanJob("scan_1", "user_1", "https://example.com", "PROFESSIONAL", queue);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, SCAN_JOB_NAME);
  assert.deepEqual(calls[0].data, {
    scanId: "scan_1",
    scanType: "PROFESSIONAL",
    userId: "user_1",
    targetUrl: "https://example.com",
  });
  assert.equal(calls[0].options.attempts, 2);
  assert.deepEqual(calls[0].options.backoff, scanJobOptions.backoff);
  assert.deepEqual(calls[0].options.removeOnComplete, { count: 100 });
  assert.deepEqual(calls[0].options.removeOnFail, { count: 500 });
});
