import { access, constants, stat } from "fs/promises";
import path from "path";
import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getCurrentUser, logUnauthorizedAdminAccess } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { addScanJob } from "@/lib/queue/scanQueue";
import { PAYMENT_PROOFS_PUBLIC_DIR } from "@/lib/manual-payments";
import { REPORTS_PUBLIC_DIR } from "@/lib/reports/pdfGenerator";
import { getLemonHealthChecks } from "@/lib/lemon";
import { getEmailHealthChecks } from "@/lib/email/emailConfig";
import { logAbuseEvent } from "@/lib/security/abuseLog";
import { getRateLimitRuleForTier } from "@/lib/security/limits";
import {
  checkRateLimit,
  createRateLimitKey,
  getRateLimiterHealth,
  getRequestContext,
  rateLimitResponseHeaders,
} from "@/lib/security/rateLimit";
export { maskId, maskToken } from "@/lib/admin-safety";

export type AdminApiUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireAdminApi(request?: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Authentication required.", success: false },
        { status: 401 },
      ),
    };
  }

  if (user.role !== "ADMIN") {
    const target = request?.url ? new URL(request.url).pathname : "/api/admin";

    await logUnauthorizedAdminAccess({
      userId: user.id,
      target,
      reason: "Non-admin attempted to call admin API.",
      request,
    });

    return {
      response: NextResponse.json(
        { error: "Admin access required.", success: false },
        { status: 403 },
      ),
    };
  }

  return { user };
}

export async function enforceAdminWriteRateLimit(input: {
  request?: Request;
  route: string;
  userId: string;
}) {
  const requestContext = await getRequestContext(input.request);
  const rule = getRateLimitRuleForTier("ADMIN", "admin_write");
  const result = await checkRateLimit({
    ...rule,
    key: createRateLimitKey({
      action: "admin_write",
      ip: requestContext.ip,
      route: input.route,
      userId: input.userId,
    }),
  });

  if (result.allowed) {
    return { result };
  }

  await logAbuseEvent({
    eventType: "RATE_LIMIT_TRIGGERED",
    ipAddress: requestContext.ip,
    metadata: {
      action: "admin_write",
      limit: result.limit,
      resetAt: result.resetAt.toISOString(),
      route: input.route,
    },
    reason: "Admin write action rate limit triggered.",
    severity: "WARNING",
    target: input.route,
    userAgent: requestContext.userAgent,
    userId: input.userId,
  });

  return {
    response: NextResponse.json(
      {
        error: "Too many admin changes. Try again later.",
        resetAt: result.resetAt.toISOString(),
        success: false,
      },
      { headers: rateLimitResponseHeaders(result), status: 429 },
    ),
    result,
  };
}

export async function assertAdminWriteRateLimit(userId: string, route: string) {
  const limited = await enforceAdminWriteRateLimit({ route, userId });

  if (limited.response) {
    throw new Error("Too many admin changes. Try again later.");
  }
}

export function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

export async function createAdminAuditLog(input: {
  adminUserId: string;
  action: string;
  targetUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  metadata?: unknown;
}) {
  const prisma = getPrisma();

  await prisma.adminAuditLog.create({
    data: {
      adminUserId: input.adminUserId,
      action: input.action,
      targetUserId: input.targetUserId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata === undefined ? undefined : safeJson(input.metadata),
    },
  });
}

export async function changeUserRole(input: {
  adminUserId: string;
  userId: string;
  role: "USER" | "ADMIN";
  reason: string;
}) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: input.userId },
      select: { id: true, role: true },
    });

    if (!target) {
      throw new Error("User not found.");
    }

    if (target.role === "ADMIN" && input.role !== "ADMIN") {
      const adminCount = await tx.user.count({ where: { role: "ADMIN" } });

      if (adminCount <= 1) {
        throw new Error("The last admin role cannot be removed.");
      }
    }

    const user = await tx.user.update({
      where: { id: input.userId },
      data: { role: input.role },
      select: { id: true, role: true },
    });

    await tx.adminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: "ROLE_CHANGED",
        targetUserId: input.userId,
        targetType: "User",
        targetId: input.userId,
        reason: input.reason,
        metadata: safeJson({ from: target.role, to: input.role }),
      },
    });

    return user;
  });
}

export async function adjustUserCredits(input: {
  adminUserId: string;
  userId: string;
  amount: number;
  reason: string;
}) {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new Error("Credit adjustment must be a non-zero whole number.");
  }

  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findFirst({
      where: { userId: input.userId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    });

    if (!subscription) {
      throw new Error("User has no active subscription to adjust.");
    }

    const nextRemaining = subscription.creditsRemaining + input.amount;
    const nextTotal = subscription.creditsTotal + input.amount;

    if (nextRemaining < 0 || nextTotal < 0) {
      throw new Error("Credit adjustment cannot make credits negative.");
    }

    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        creditsRemaining: nextRemaining,
        creditsTotal: nextTotal,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: "CREDITS_ADJUSTED",
        targetUserId: input.userId,
        targetType: "Subscription",
        targetId: subscription.id,
        reason: input.reason,
        metadata: safeJson({ amount: input.amount, nextRemaining }),
      },
    });

    return updated;
  });
}

export async function changeUserStatus(input: {
  adminUserId: string;
  userId: string;
  status: "ACTIVE" | "SUSPENDED";
  reason: string;
}) {
  const prisma = getPrisma();
  const user = await prisma.user.update({
    where: { id: input.userId },
    data: { status: input.status },
    select: { id: true, status: true },
  });

  await createAdminAuditLog({
    adminUserId: input.adminUserId,
    action: input.status === "SUSPENDED" ? "USER_SUSPENDED" : "USER_UNSUSPENDED",
    targetUserId: input.userId,
    targetType: "User",
    targetId: input.userId,
    reason: input.reason,
  });

  return user;
}

export async function retryFailedScan(adminUserId: string, scanId: string) {
  const prisma = getPrisma();
  const scan = await prisma.scan.findUnique({ where: { id: scanId } });

  if (!scan || scan.status !== "FAILED") {
    throw new Error("Only failed scans can be retried.");
  }

  await prisma.scan.update({
    where: { id: scanId },
    data: { status: "PENDING", errorMessage: null, startedAt: null, completedAt: null },
  });
  await prisma.scanLog.create({
    data: { scanId, level: "INFO", message: "Admin retry requested" },
  });
  await addScanJob(
    scan.id,
    scan.userId,
    scan.normalizedUrl,
    scan.scanType === "BASIC" ? "BASIC" : "PROFESSIONAL",
  );
  await createAdminAuditLog({
    adminUserId,
    action: "SCAN_RETRIED",
    targetUserId: scan.userId,
    targetType: "Scan",
    targetId: scan.id,
  });
}

export async function markScanFailed(input: {
  adminUserId: string;
  scanId: string;
  reason: string;
}) {
  const prisma = getPrisma();
  const scan = await prisma.scan.findUnique({ where: { id: input.scanId } });

  if (!scan || scan.status !== "RUNNING") {
    throw new Error("Only running scans can be marked failed.");
  }

  await prisma.scan.update({
    where: { id: input.scanId },
    data: {
      status: "FAILED",
      errorMessage: input.reason,
      completedAt: new Date(),
    },
  });
  await prisma.scanLog.create({
    data: { scanId: input.scanId, level: "ERROR", message: input.reason },
  });
  await createAdminAuditLog({
    adminUserId: input.adminUserId,
    action: "SCAN_MARKED_FAILED",
    targetUserId: scan.userId,
    targetType: "Scan",
    targetId: scan.id,
    reason: input.reason,
  });
}

export async function revokeShare(input: {
  adminUserId: string;
  shareId: string;
  reason: string;
}) {
  const prisma = getPrisma();
  const share = await prisma.reportShare.update({
    where: { id: input.shareId },
    data: { isActive: false },
    include: { user: { select: { id: true } } },
  });

  await createAdminAuditLog({
    adminUserId: input.adminUserId,
    action: "SHARE_REVOKED_BY_ADMIN",
    targetUserId: share.user.id,
    targetType: "ReportShare",
    targetId: share.id,
    reason: input.reason,
  });

  return share;
}

export async function getSystemHealth() {
  async function exists(dir: string) {
    return stat(dir).then((value) => value.isDirectory()).catch(() => false);
  }

  async function writable(dir: string) {
    return access(dir, constants.W_OK).then(() => true).catch(() => false);
  }

  const prisma = getPrisma();
  const databaseOk = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  const notificationModelAvailable = await prisma.notification
    .count({ take: 1 })
    .then(() => true)
    .catch(() => false);
  const notificationPreferencesAvailable = await prisma.userNotificationPreference
    .count({ take: 1 })
    .then(() => true)
    .catch(() => false);
  const reportsDir = REPORTS_PUBLIC_DIR;
  const agencyDir = path.join(process.cwd(), "public", "agency-assets");
  const proofsDir = PAYMENT_PROOFS_PUBLIC_DIR;
  const chromiumPath = path.join(process.cwd(), "node_modules", "playwright");

  return {
    database: databaseOk,
    notificationModelAvailable,
    notificationPreferencesAvailable,
    redis: Boolean(process.env.REDIS_URL),
    ...(await getRateLimiterHealth()),
    pdfReportDirectoryExists: await exists(reportsDir),
    pdfReportDirectoryWritable: await writable(reportsDir),
    agencyAssetsDirectoryExists: await exists(agencyDir),
    paymentProofDirectoryExists: await exists(proofsDir),
    playwrightChromiumAvailable: await exists(chromiumPath),
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    redisUrlConfigured: Boolean(process.env.REDIS_URL),
    nextauthSecretConfigured: Boolean(process.env.NEXTAUTH_SECRET),
    sessionSecretConfigured: Boolean(process.env.SESSION_SECRET),
    stripeSecretKeyConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    stripePublishableKeyConfigured: Boolean(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    ),
    ...getLemonHealthChecks(),
    ...getEmailHealthChecks(),
    manualPaymentBankConfigured: Boolean(
      process.env.MANUAL_PAYMENT_BANK_TITLE && process.env.MANUAL_PAYMENT_BANK_IBAN,
    ),
    easyPaisaConfigured: Boolean(
      process.env.MANUAL_PAYMENT_EASYPAISA_TITLE &&
        process.env.MANUAL_PAYMENT_EASYPAISA_NUMBER,
    ),
    jazzCashConfigured: Boolean(
      process.env.MANUAL_PAYMENT_JAZZCASH_TITLE &&
        process.env.MANUAL_PAYMENT_JAZZCASH_NUMBER,
    ),
    appUrlConfigured: Boolean(process.env.APP_URL),
    nextPublicAppUrlConfigured: Boolean(process.env.NEXT_PUBLIC_APP_URL),
  };
}
