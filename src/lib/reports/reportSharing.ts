import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { z } from "zod";

export const SHARE_DISCLAIMER =
  "This report is based on automated safe checks only. It is not a penetration test, security certification, or full OWASP compliance audit.";

const SHARE_PASSWORD_COOKIE_PREFIX = "smb_share_access_";
const SHARE_PASSWORD_COOKIE_MAX_AGE = 60 * 60 * 12;

export const reportShareInputSchema = z
  .object({
    clientId: z.preprocess(
      (value) => (value === null ? undefined : value),
      z
        .string()
        .trim()
        .optional()
        .transform((value) => (value ? value : null)),
    ),
    customExpiresAt: z.preprocess(
      (value) => (value === null ? undefined : value),
      z
        .string()
        .trim()
        .optional()
        .transform((value) => (value ? value : null)),
    ),
    expiresIn: z.enum(["never", "7", "30", "custom"]).default("never"),
    password: z.preprocess(
      (value) => (value === null ? undefined : value),
      z
        .string()
        .optional()
        .transform((value) => (value ? value : null)),
    ),
    title: z.preprocess(
      (value) => (value === null ? undefined : value),
      z
        .string()
        .trim()
        .max(120, "Report title must be 120 characters or fewer.")
        .optional()
        .transform((value) => (value ? value : null)),
    ),
  })
  .superRefine((input, context) => {
    if (input.password && input.password.length < 8) {
      context.addIssue({
        code: "custom",
        message: "Password must be at least 8 characters.",
        path: ["password"],
      });
    }

    if (input.expiresIn === "custom") {
      if (!input.customExpiresAt) {
        context.addIssue({
          code: "custom",
          message: "Choose a custom expiration date.",
          path: ["customExpiresAt"],
        });
        return;
      }

      const date = new Date(input.customExpiresAt);

      if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        context.addIssue({
          code: "custom",
          message: "Expiration date must be in the future.",
          path: ["customExpiresAt"],
        });
      }
    }
  });

export type ReportShareInput = z.infer<typeof reportShareInputSchema>;

export class ReportShareError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function generateShareToken() {
  return randomBytes(32).toString("base64url");
}

export function getShareExpiry(input: Pick<ReportShareInput, "customExpiresAt" | "expiresIn">) {
  if (input.expiresIn === "never") {
    return null;
  }

  if (input.expiresIn === "custom") {
    return input.customExpiresAt ? new Date(input.customExpiresAt) : null;
  }

  const days = Number(input.expiresIn);
  const expiresAt = new Date();

  expiresAt.setDate(expiresAt.getDate() + days);

  return expiresAt;
}

export function parseReportShareInput(input: unknown): ReportShareInput {
  const validated = reportShareInputSchema.safeParse(input);

  if (!validated.success) {
    throw new ReportShareError(
      validated.error.issues[0]?.message ?? "Invalid share link data.",
      400,
    );
  }

  return validated.data;
}

function getShareCookieSecret() {
  const secret = process.env.SESSION_SECRET ?? process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET or AUTH_SECRET must be set for share passwords.");
  }

  return secret;
}

function signShareToken(token: string) {
  return createHmac("sha256", getShareCookieSecret()).update(token).digest("base64url");
}

function getSharePasswordCookieName(token: string) {
  const suffix = createHmac("sha256", getShareCookieSecret())
    .update(`cookie:${token}`)
    .digest("base64url")
    .slice(0, 24);

  return `${SHARE_PASSWORD_COOKIE_PREFIX}${suffix}`;
}

function isValidSignedShareCookie(token: string, value?: string) {
  if (!value) {
    return false;
  }

  const expected = signShareToken(token);
  const expectedBuffer = Buffer.from(expected);
  const valueBuffer = Buffer.from(value);

  return (
    expectedBuffer.length === valueBuffer.length &&
    timingSafeEqual(expectedBuffer, valueBuffer)
  );
}

async function getCookieStore() {
  const { cookies } = await import("next/headers.js");

  return cookies();
}

export async function hasVerifiedSharePassword(token: string) {
  const cookieStore = await getCookieStore();
  const value = cookieStore.get(getSharePasswordCookieName(token))?.value;

  return isValidSignedShareCookie(token, value);
}

export async function markSharePasswordVerified(token: string) {
  const cookieStore = await getCookieStore();

  cookieStore.set({
    httpOnly: true,
    maxAge: SHARE_PASSWORD_COOKIE_MAX_AGE,
    name: getSharePasswordCookieName(token),
    path: `/share/report/${token}`,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: signShareToken(token),
  });
}

export function isShareExpired(expiresAt: Date | null) {
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
}

export async function createReportShareForUser(
  userId: string,
  reportId: string,
  input: ReportShareInput,
) {
  const {
    canCreateShareLinkForEntitlements,
    getPlanEntitlementsForUser,
  } = await import("../billing/planEntitlements.ts");
  const { getOwnedClient } = await import("../clients/clientService.ts");
  const [entitlements, client] = await Promise.all([
    getPlanEntitlementsForUser(userId),
    input.clientId ? getOwnedClient(userId, input.clientId) : Promise.resolve(null),
  ]);
  const canShare = canCreateShareLinkForEntitlements(entitlements);

  if (!canShare) {
    const blockedReason = "Secure report sharing is not included in your current plan.";
    const { logAbuseEvent } = await import("../security/abuseLog.ts");
    await logAbuseEvent({
      eventType: "PLAN_SHARE_ACCESS_BLOCKED",
      metadata: {
        feature: "report_share_create",
        planId: entitlements.planId,
        planName: entitlements.planName,
        planSlug: entitlements.planSlug ?? null,
        reason: blockedReason,
      },
      reason: blockedReason,
      severity: "INFO",
      target: reportId,
      userId,
    });

    throw new ReportShareError(
      blockedReason,
      403,
    );
  }

  if (input.clientId && !client) {
    throw new ReportShareError("Client was not found.", 404);
  }

  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();
  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      userId,
      status: "GENERATED",
    },
    select: {
      clientId: true,
      filePath: true,
      id: true,
      pdfUrl: true,
      scan: {
        select: {
          clientId: true,
          scanType: true,
        },
      },
    },
  });

  if (!report) {
    throw new ReportShareError("Report was not found.", 404);
  }

  if (!report.filePath && !report.pdfUrl) {
    throw new ReportShareError("Generate a PDF report before creating a share link.", 400);
  }

  if (report.scan.scanType === "BASIC") {
    throw new ReportShareError(
      "Secure share links are available with Professional Scan reports.",
      403,
    );
  }

  const { hashPassword } = await import("../password.ts");
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const clientId = input.clientId ?? report.clientId ?? report.scan.clientId ?? null;

  return prisma.reportShare.create({
    data: {
      clientId,
      expiresAt: getShareExpiry(input),
      passwordHash,
      reportId,
      title: input.title,
      token: generateShareToken(),
      userId,
    },
    select: {
      createdAt: true,
      expiresAt: true,
      id: true,
      isActive: true,
      lastViewedAt: true,
      title: true,
      token: true,
      viewCount: true,
    },
  });
}

export async function listSharesForReport(userId: string, reportId: string) {
  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();
  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!report) {
    throw new ReportShareError("Report was not found.", 404);
  }

  return prisma.reportShare.findMany({
    where: {
      reportId,
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      createdAt: true,
      expiresAt: true,
      id: true,
      isActive: true,
      lastViewedAt: true,
      title: true,
      token: true,
      viewCount: true,
    },
  });
}

export async function revokeShareForUser(userId: string, shareId: string) {
  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();
  const result = await prisma.reportShare.updateMany({
    where: {
      id: shareId,
      userId,
    },
    data: {
      isActive: false,
    },
  });

  if (result.count === 0) {
    throw new ReportShareError("Share link was not found.", 404);
  }

  return { success: true };
}

export async function verifySharePassword(token: string, password: string) {
  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();
  const share = await prisma.reportShare.findUnique({
    where: { token },
    select: {
      expiresAt: true,
      isActive: true,
      passwordHash: true,
    },
  });

  if (!share || !share.isActive || isShareExpired(share.expiresAt)) {
    return { ok: false, reason: "not-found" as const };
  }

  if (!share.passwordHash) {
    await markSharePasswordVerified(token);

    return { ok: true as const };
  }

  const { verifyPassword } = await import("../password.ts");
  const ok = await verifyPassword(password, share.passwordHash);

  if (ok) {
    await markSharePasswordVerified(token);
  }

  return ok ? { ok: true as const } : { ok: false, reason: "password" as const };
}

export async function getPublicShareForToken(token: string, options?: { countView?: boolean }) {
  const { getPrisma } = await import("../prisma.ts");
  const prisma = getPrisma();
  const share = await prisma.reportShare.findUnique({
    where: { token },
    include: {
      client: {
        select: {
          companyName: true,
          name: true,
        },
      },
      report: {
        include: {
          scan: {
            select: {
              grade: true,
              rootDomain: true,
              score: true,
            },
          },
          user: {
            select: {
              agencyProfile: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!share) {
    return { reason: "not-found" as const, share: null };
  }

  if (!share.isActive) {
    return { reason: "inactive" as const, share: null };
  }

  if (isShareExpired(share.expiresAt)) {
    return { reason: "expired" as const, share: null };
  }

  const needsPassword = Boolean(share.passwordHash);
  const hasPassword = !needsPassword || (await hasVerifiedSharePassword(token));

  if (!hasPassword) {
    return { reason: "password-required" as const, share };
  }

  if (options?.countView) {
    const updated = await prisma.reportShare.update({
      where: { id: share.id },
      data: {
        lastViewedAt: new Date(),
        viewCount: {
          increment: 1,
        },
      },
      include: {
        client: {
          select: {
            companyName: true,
            name: true,
          },
        },
        report: {
          include: {
            scan: {
              select: {
                grade: true,
                rootDomain: true,
                score: true,
              },
            },
            user: {
              select: {
                agencyProfile: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return { reason: null, share: updated };
  }

  return { reason: null, share };
}
