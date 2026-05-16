"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertActiveUser, requireUser } from "@/lib/auth";
import {
  canSubmitScan,
  getPlanEntitlementsForUser,
} from "@/lib/billing/planEntitlements";
import { getPrisma } from "@/lib/prisma";
import { addScanJob } from "@/lib/queue/scanQueue";
import {
  createFailedScanUpdate,
  getSafeScanErrorMessage,
  ScanProcessingError,
} from "@/lib/scans/scanLifecycle";
import {
  checkRedirectSafety,
  extractRootDomain,
  normalizeUrl,
  TOO_MANY_REDIRECTS_REASON,
  UrlSafetyError,
} from "@/lib/security/urlSafety";
import { logAbuseEvent, type AbuseEventType } from "@/lib/security/abuseLog";
import {
  UNSAFE_TARGET_SUBMISSION_LIMIT,
  getLimitTierForPlanSlug,
  getRateLimitRuleForTier,
} from "@/lib/security/limits";
import {
  checkRateLimit,
  createRateLimitKey,
  getRequestContext,
} from "@/lib/security/rateLimit";

const INVALID_SCAN_TYPE_MESSAGE = "Invalid scan type selected.";
const BASIC_SCAN_BLOCK_MESSAGE = "Your current plan does not include Basic Scan.";
const PROFESSIONAL_SCAN_BLOCK_MESSAGE =
  "Your current plan does not include Professional Scan.";

const scanTypeSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
  z.enum(["BASIC", "PROFESSIONAL"], {
    error: INVALID_SCAN_TYPE_MESSAGE,
  }),
);

const submitScanSchema = z.object({
  clientId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value !== "__none" ? value : undefined)),
  targetUrl: z.string().trim().min(1, "Enter a website URL."),
  clientName: z.string().trim().max(120, "Client name is too long.").optional(),
  scanType: scanTypeSchema,
});

const SCAN_LIMIT_MESSAGE = "Scan limit reached. Try again later or upgrade.";
const PLAN_SCAN_LIMIT_MESSAGE = "Daily scan limit reached for your plan.";

export type SubmitScanState = {
  errors?: {
    targetUrl?: string[];
    clientName?: string[];
    clientId?: string[];
    scanType?: string[];
  };
  message?: string;
};

function getBlockedScanEventType(
  error: unknown,
  reason: string,
): AbuseEventType {
  if (error instanceof UrlSafetyError && error.code === TOO_MANY_REDIRECTS_REASON) {
    return "BLOCKED_TOO_MANY_REDIRECTS";
  }

  if (/protocol|http and https/i.test(reason)) {
    return "BLOCKED_UNSAFE_PROTOCOL";
  }

  if (/localhost|local or internal/i.test(reason)) {
    return "BLOCKED_LOCALHOST_SCAN";
  }

  if (/internal|unsafe address|private/i.test(reason)) {
    return "BLOCKED_PRIVATE_IP_SCAN";
  }

  return "BLOCKED_SCAN_TARGET";
}

function getCurrentDayWindow(now = new Date()) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return {
    dayEnd,
    dayStart,
  };
}

function getPlanDailyScanLimit(
  scanType: "BASIC" | "PROFESSIONAL",
  entitlements: {
    basicScanLimitPerDay: number;
    professionalScanLimitPerDay: number;
  },
) {
  return scanType === "BASIC"
    ? entitlements.basicScanLimitPerDay
    : entitlements.professionalScanLimitPerDay;
}

export async function submitScanAction(
  _previousState: SubmitScanState,
  formData: FormData,
): Promise<SubmitScanState> {
  const user = await requireUser();
  await assertActiveUser(user.id);
  const validatedFields = submitScanSchema.safeParse({
    targetUrl: formData.get("targetUrl"),
    clientId: formData.get("clientId") || undefined,
    clientName: formData.get("clientName") || undefined,
    scanType: formData.get("scanType"),
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;

    return {
      errors: fieldErrors,
      message: fieldErrors.scanType?.[0] ?? "Please fix the highlighted fields.",
    };
  }

  const { clientId, scanType, targetUrl } = validatedFields.data;
  const requestContext = await getRequestContext();
  const entitlements = await getPlanEntitlementsForUser(user.id);
  const tier = getLimitTierForPlanSlug(entitlements.planSlug, user.role);
  const scanRule = getRateLimitRuleForTier(tier, "scan_submit");
  const scanLimit = await checkRateLimit({
    ...scanRule,
    key: createRateLimitKey({
      action: "scan_submit",
      ip: requestContext.ip,
      route: "submitScanAction",
      userId: user.id,
    }),
  });

  if (!scanLimit.allowed) {
    await logAbuseEvent({
      eventType: "RATE_LIMIT_TRIGGERED",
      ipAddress: requestContext.ip,
      metadata: {
        action: "scan_submit",
        limit: scanLimit.limit,
        resetAt: scanLimit.resetAt.toISOString(),
        tier,
      },
      reason: "Scan submission rate limit triggered.",
      severity: "WARNING",
      target: targetUrl,
      userAgent: requestContext.userAgent,
      userId: user.id,
    });

    return {
      errors: {
        targetUrl: [SCAN_LIMIT_MESSAGE],
      },
      message: SCAN_LIMIT_MESSAGE,
    };
  }

  const scanAccess = await canSubmitScan(user.id, scanType);

  if (!scanAccess.allowed) {
    const blockedMessage =
      scanType === "BASIC"
        ? BASIC_SCAN_BLOCK_MESSAGE
        : PROFESSIONAL_SCAN_BLOCK_MESSAGE;

    await logAbuseEvent({
      eventType: "PLAN_SCAN_ACCESS_BLOCKED",
      ipAddress: requestContext.ip,
      metadata: {
        planId: entitlements.planId,
        planName: entitlements.planName,
        planSlug: entitlements.planSlug,
        reason: blockedMessage,
        requestedScanType: scanType,
      },
      reason: blockedMessage,
      severity: "WARNING",
      target: targetUrl,
      userAgent: requestContext.userAgent,
      userId: user.id,
    });

    return {
      errors: {
        scanType: [blockedMessage],
      },
      message: blockedMessage,
    };
  }

  const prisma = getPrisma();
  const { dayEnd, dayStart } = getCurrentDayWindow();
  const dailyLimit = getPlanDailyScanLimit(scanType, entitlements);
  const scansTodayCount = await prisma.scan.count({
    where: {
      userId: user.id,
      scanType,
      createdAt: {
        gte: dayStart,
        lt: dayEnd,
      },
    },
  });

  if (scansTodayCount >= dailyLimit) {
    await logAbuseEvent({
      eventType: "PLAN_SCAN_LIMIT_REACHED",
      ipAddress: requestContext.ip,
      metadata: {
        currentCount: scansTodayCount,
        dayEnd: dayEnd.toISOString(),
        dayStart: dayStart.toISOString(),
        limit: dailyLimit,
        planId: entitlements.planId,
        planName: entitlements.planName,
        planSlug: entitlements.planSlug,
        requestedScanType: scanType,
      },
      reason: PLAN_SCAN_LIMIT_MESSAGE,
      severity: "WARNING",
      target: targetUrl,
      userAgent: requestContext.userAgent,
      userId: user.id,
    });

    return {
      errors: {
        scanType: [PLAN_SCAN_LIMIT_MESSAGE],
      },
      message: PLAN_SCAN_LIMIT_MESSAGE,
    };
  }

  let normalizedUrl: string;

  try {
    normalizedUrl = normalizeUrl(targetUrl);
    await checkRedirectSafety(normalizedUrl);
  } catch (error) {
    const message =
      error instanceof UrlSafetyError
        ? error.message
        : "This URL could not be verified safely.";
    const abuseReason =
      error instanceof UrlSafetyError && error.code === TOO_MANY_REDIRECTS_REASON
        ? TOO_MANY_REDIRECTS_REASON
        : message;
    const unsafeLimit = await checkRateLimit({
      ...UNSAFE_TARGET_SUBMISSION_LIMIT,
      key: createRateLimitKey({
        action: "scan_submit",
        ip: requestContext.ip,
        route: "submitScanAction",
        scope: "unsafe-target",
        target: targetUrl,
        userId: user.id,
      }),
    });

    await logAbuseEvent({
      eventType: getBlockedScanEventType(error, abuseReason),
      ipAddress: requestContext.ip,
      metadata: {
        blockedByUnsafeRateLimit: !unsafeLimit.allowed,
        resetAt: unsafeLimit.allowed ? undefined : unsafeLimit.resetAt.toISOString(),
      },
      reason: abuseReason,
      severity: unsafeLimit.allowed ? "WARNING" : "HIGH",
      target: targetUrl,
      userAgent: requestContext.userAgent,
      userId: user.id,
    });

    if (!unsafeLimit.allowed) {
      await logAbuseEvent({
        eventType: "RATE_LIMIT_TRIGGERED",
        ipAddress: requestContext.ip,
        metadata: {
          action: "scan_submit",
          limit: unsafeLimit.limit,
          resetAt: unsafeLimit.resetAt.toISOString(),
          scope: "unsafe-target",
        },
        reason: "Repeated unsafe scan target submissions were blocked.",
        severity: "HIGH",
        target: targetUrl,
        userAgent: requestContext.userAgent,
        userId: user.id,
      });

      return {
        errors: {
          targetUrl: [SCAN_LIMIT_MESSAGE],
        },
        message: SCAN_LIMIT_MESSAGE,
      };
    }

    return {
      errors: {
        targetUrl: [message],
      },
      message,
    };
  }

  const shouldAllowClientAssignment = scanType === "PROFESSIONAL";
  const client = shouldAllowClientAssignment && clientId
    ? await prisma.client.findFirst({
        where: {
          id: clientId,
          userId: user.id,
        },
        select: {
          id: true,
          name: true,
        },
      })
    : null;

  if (clientId && !client) {
    return {
      errors: {
        clientId: ["Select a valid client."],
      },
      message: "Please fix the highlighted fields.",
    };
  }

  const clientName = shouldAllowClientAssignment
    ? client?.name ?? validatedFields.data.clientName ?? null
    : null;
  const scan = await prisma.scan.create({
    data: {
      clientId: shouldAllowClientAssignment ? (client?.id ?? null) : null,
      clientName,
      scanType,
      userId: user.id,
      targetUrl,
      normalizedUrl,
      rootDomain: extractRootDomain(normalizedUrl),
      status: "PENDING",
      score: null,
      grade: null,
    },
    select: {
      id: true,
    },
  });

  try {
    await addScanJob(scan.id, user.id, normalizedUrl, scanType);
    await prisma.scanLog.create({
      data: {
        scanId: scan.id,
        level: "INFO",
        message: "Scan job enqueued",
      },
    });
  } catch {
    const queueError = new ScanProcessingError(
      "The scan was created, but the background scan queue is unavailable. Start Redis and submit the scan again.",
    );
    const failedUpdate = createFailedScanUpdate(queueError);

    await prisma.scan.update({
      where: { id: scan.id },
      data: failedUpdate,
    });
    await prisma.scanLog.create({
      data: {
        scanId: scan.id,
        level: "ERROR",
        message: `Scan queue unavailable: ${getSafeScanErrorMessage(queueError)}`,
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/scans");
  revalidatePath(`/dashboard/scans/${scan.id}`);
  redirect(`/dashboard/scans/${scan.id}`);
}
