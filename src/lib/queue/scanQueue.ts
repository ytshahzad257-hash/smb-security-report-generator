import { Queue, type JobsOptions } from "bullmq";

export const SCAN_QUEUE_NAME = "website-scan";
export const SCAN_JOB_NAME = "process-website-scan";

export type ScanJobData = {
  scanId: string;
  scanType: "BASIC" | "PROFESSIONAL";
  userId: string;
  targetUrl: string;
};

type QueueLike = {
  add: (
    name: typeof SCAN_JOB_NAME,
    data: ScanJobData,
    options: JobsOptions,
  ) => Promise<unknown>;
};

const globalForScanQueue = globalThis as unknown as {
  scanQueue?: Queue<ScanJobData>;
};

export const scanJobOptions: JobsOptions = {
  attempts: 2,
  backoff: {
    type: "exponential",
    delay: 5_000,
  },
  removeOnComplete: {
    count: 100,
  },
  removeOnFail: {
    count: 500,
  },
};

function getRedisUrl() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL must be set before using the scan queue.");
  }

  return redisUrl;
}

export function getScanQueue() {
  const queue =
    globalForScanQueue.scanQueue ??
    new Queue<ScanJobData>(SCAN_QUEUE_NAME, {
      connection: {
        url: getRedisUrl(),
        connectTimeout: 3_000,
        maxRetriesPerRequest: 1,
        retryStrategy: (attempts) => (attempts > 1 ? null : 250),
      },
      defaultJobOptions: scanJobOptions,
      skipWaitingForReady: true,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForScanQueue.scanQueue = queue;
  }

  return queue;
}

export function getScanWorkerConnectionOptions() {
  return {
    url: getRedisUrl(),
    maxRetriesPerRequest: null,
  };
}

export function buildScanJobData(
  scanId: string,
  userId: string,
  targetUrl: string,
  scanType: "BASIC" | "PROFESSIONAL",
): ScanJobData {
  return {
    scanId,
    scanType,
    userId,
    targetUrl,
  };
}

export async function addScanJob(
  scanId: string,
  userId: string,
  targetUrl: string,
  scanType: "BASIC" | "PROFESSIONAL",
  queue: QueueLike = getScanQueue(),
) {
  return queue.add(
    SCAN_JOB_NAME,
    buildScanJobData(scanId, userId, targetUrl, scanType),
    scanJobOptions,
  );
}
