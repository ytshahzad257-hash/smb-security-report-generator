const GENERIC_SCAN_ERROR = "The scan worker could not complete this job safely.";
const MAX_ERROR_MESSAGE_LENGTH = 240;

export class ScanProcessingError extends Error {
  markScanFailed: boolean;

  constructor(message: string, options?: { markScanFailed?: boolean }) {
    super(message);
    this.name = "ScanProcessingError";
    this.markScanFailed = options?.markScanFailed ?? true;
  }
}

export function createRunningScanUpdate(now = new Date()) {
  return {
    status: "RUNNING" as const,
    startedAt: now,
    completedAt: null,
    errorMessage: null,
  };
}

export function createCompletedScanUpdate(
  now = new Date(),
  scoreResult?: { score: number; grade: string },
) {
  return {
    status: "COMPLETED" as const,
    completedAt: now,
    score: scoreResult?.score ?? null,
    grade: scoreResult?.grade ?? null,
    errorMessage: null,
  };
}

export function createFailedScanUpdate(error: unknown, now = new Date()) {
  return {
    status: "FAILED" as const,
    completedAt: now,
    errorMessage: getSafeScanErrorMessage(error),
  };
}

export function shouldMarkScanFailed(error: unknown) {
  return !(error instanceof ScanProcessingError && !error.markScanFailed);
}

export function getSafeScanErrorMessage(error: unknown) {
  if (
    error instanceof ScanProcessingError ||
    (error instanceof Error && error.name === "UrlSafetyError")
  ) {
    return sanitizeErrorMessage(error.message);
  }

  return GENERIC_SCAN_ERROR;
}

function sanitizeErrorMessage(message: string) {
  const safeMessage = message.replace(/[\r\n\t]+/g, " ").trim();

  if (!safeMessage) {
    return GENERIC_SCAN_ERROR;
  }

  return safeMessage.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${safeMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH - 3)}...`
    : safeMessage;
}
