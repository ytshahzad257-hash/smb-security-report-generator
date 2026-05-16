import { loadEnvConfig } from "@next/env";
import { Worker } from "bullmq";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  getScanWorkerConnectionOptions,
  SCAN_QUEUE_NAME,
  type ScanJobData,
} from "../lib/queue/scanQueue";
import { processScanJob } from "../lib/scans/scanProcessor";

loadEnvConfig(process.cwd());

export function createScanWorker() {
  const worker = new Worker<ScanJobData>(
    SCAN_QUEUE_NAME,
    async (job) => processScanJob(job.data),
    {
      connection: getScanWorkerConnectionOptions(),
      concurrency: 1,
      removeOnComplete: {
        count: 100,
      },
      removeOnFail: {
        count: 500,
      },
    },
  );

  worker.on("completed", (job) => {
    console.log(`Scan job ${job.id} completed for scan ${job.data.scanId}.`);
  });

  worker.on("failed", (job, error) => {
    const scanId = job?.data.scanId ?? "unknown";
    console.error(`Scan job failed for scan ${scanId}: ${error.message}`);
  });

  worker.on("error", (error) => {
    console.error(`Scan worker error: ${error.message}`);
  });

  return worker;
}

function registerShutdown(worker: Worker<ScanJobData>) {
  let closing = false;

  async function close(signal: string) {
    if (closing) {
      return;
    }

    closing = true;
    console.log(`Received ${signal}. Closing scan worker...`);
    await worker.close();
    process.exit(0);
  }

  process.once("SIGINT", () => {
    void close("SIGINT");
  });
  process.once("SIGTERM", () => {
    void close("SIGTERM");
  });
}

const currentFile = fileURLToPath(import.meta.url);
const launchedFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (currentFile === launchedFile) {
  const worker = createScanWorker();
  registerShutdown(worker);

  worker
    .waitUntilReady()
    .then(() => {
      console.log(`Scan worker listening on ${SCAN_QUEUE_NAME}.`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown worker error.";
      console.error(`Scan worker could not start: ${message}`);
      process.exit(1);
    });
}
