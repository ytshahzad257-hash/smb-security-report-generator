"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  adjustUserCredits,
  assertAdminWriteRateLimit,
  changeUserRole,
  changeUserStatus,
  createAdminAuditLog,
  markScanFailed,
  retryFailedScan,
  revokeShare,
} from "@/lib/admin";
import { requireAdminUser } from "@/lib/auth";
import {
  getAppUrl,
  getEmailConfig,
  isValidEmailAddress,
} from "@/lib/email/emailConfig";
import { emailTemplates } from "@/lib/email/emailTemplates";
import { sendEmail } from "@/lib/email/sendEmail";
import {
  buildPlanAuditMetadata,
  parsePlanUpdateFromFormData,
  toPlanUpdateData,
} from "@/lib/admin-plan-update";
import { getPrisma } from "@/lib/prisma";
import { logAbuseEvent } from "@/lib/security/abuseLog";
import { getRateLimitRuleForTier } from "@/lib/security/limits";
import {
  checkRateLimit,
  createRateLimitKey,
  getRequestContext,
} from "@/lib/security/rateLimit";

const reasonSchema = z.string().trim().min(3, "A reason is required.").max(1000);

export type AdminPlanUpdateActionState = {
  changedFields?: string[];
  errors?: Record<string, string[]>;
  message?: string;
  planId?: string;
  status?: "error" | "success";
  warnings?: string[];
};

export async function adminChangeUserRole(formData: FormData) {
  const admin = await requireAdminUser();
  await assertAdminWriteRateLimit(admin.id, "adminChangeUserRole");
  const parsed = z
    .object({
      userId: z.string().min(1),
      role: z.enum(["USER", "ADMIN"]),
      reason: reasonSchema,
    })
    .parse(Object.fromEntries(formData));

  await changeUserRole({ adminUserId: admin.id, ...parsed });
  revalidatePath("/dashboard/admin/users");
  revalidatePath(`/dashboard/admin/users/${parsed.userId}`);
}

export async function adminAdjustCredits(formData: FormData) {
  const admin = await requireAdminUser();
  await assertAdminWriteRateLimit(admin.id, "adminAdjustCredits");
  const parsed = z
    .object({
      userId: z.string().min(1),
      amount: z.coerce.number().int(),
      reason: reasonSchema,
    })
    .parse(Object.fromEntries(formData));

  await adjustUserCredits({ adminUserId: admin.id, ...parsed });
  revalidatePath("/dashboard/admin/users");
  revalidatePath(`/dashboard/admin/users/${parsed.userId}`);
}

export async function adminChangeUserStatus(formData: FormData) {
  const admin = await requireAdminUser();
  await assertAdminWriteRateLimit(admin.id, "adminChangeUserStatus");
  const parsed = z
    .object({
      userId: z.string().min(1),
      status: z.enum(["ACTIVE", "SUSPENDED"]),
      reason: reasonSchema,
    })
    .parse(Object.fromEntries(formData));

  await changeUserStatus({ adminUserId: admin.id, ...parsed });
  revalidatePath("/dashboard/admin/users");
  revalidatePath(`/dashboard/admin/users/${parsed.userId}`);
}

export async function adminUpdatePlan(
  _previousState: AdminPlanUpdateActionState,
  formData: FormData,
): Promise<AdminPlanUpdateActionState> {
  const admin = await requireAdminUser();
  await assertAdminWriteRateLimit(admin.id, "adminUpdatePlan");
  const planId = z.string().min(1).safeParse(formData.get("planId"));

  if (!planId.success) {
    return {
      message: "Invalid plan update request.",
      status: "error",
    };
  }

  const parsed = parsePlanUpdateFromFormData(formData);

  if (!parsed.success) {
    return {
      errors: parsed.errors,
      message: "Please fix the highlighted plan fields.",
      planId: planId.data,
      status: "error",
    };
  }

  const prisma = getPrisma();
  const existingPlan = await prisma.plan.findUnique({
    where: { id: planId.data },
  });

  if (!existingPlan) {
    return {
      message: "Plan not found.",
      planId: planId.data,
      status: "error",
    };
  }

  const updateData = toPlanUpdateData(parsed.data, existingPlan);
  const auditMetadata = buildPlanAuditMetadata({
    before: existingPlan,
    afterData: updateData,
    planId: existingPlan.id,
    planName: parsed.data.name,
    warnings: parsed.warnings,
  });

  await prisma.plan.update({
    where: { id: existingPlan.id },
    data: updateData,
  });
  await createAdminAuditLog({
    adminUserId: admin.id,
    action: "PLAN_UPDATED",
    targetType: "Plan",
    targetId: existingPlan.id,
    metadata: auditMetadata,
  });
  revalidatePath("/dashboard/admin/plans");

  return {
    changedFields: auditMetadata.changedFields,
    message: "Plan settings saved.",
    planId: existingPlan.id,
    status: "success",
    warnings: parsed.warnings,
  };
}

export async function adminRetryScan(formData: FormData) {
  const admin = await requireAdminUser();
  await assertAdminWriteRateLimit(admin.id, "adminRetryScan");
  const scanId = z.string().min(1).parse(formData.get("scanId"));

  await retryFailedScan(admin.id, scanId);
  revalidatePath("/dashboard/admin/scans");
  revalidatePath(`/dashboard/admin/scans/${scanId}`);
}

export async function adminMarkScanFailed(formData: FormData) {
  const admin = await requireAdminUser();
  await assertAdminWriteRateLimit(admin.id, "adminMarkScanFailed");
  const parsed = z
    .object({ scanId: z.string().min(1), reason: reasonSchema })
    .parse(Object.fromEntries(formData));

  await markScanFailed({ adminUserId: admin.id, ...parsed });
  revalidatePath("/dashboard/admin/scans");
  revalidatePath(`/dashboard/admin/scans/${parsed.scanId}`);
}

export async function adminRevokeShare(formData: FormData) {
  const admin = await requireAdminUser();
  await assertAdminWriteRateLimit(admin.id, "adminRevokeShare");
  const parsed = z
    .object({ shareId: z.string().min(1), reason: reasonSchema })
    .parse(Object.fromEntries(formData));

  await revokeShare({ adminUserId: admin.id, ...parsed });
  revalidatePath("/dashboard/admin/shares");
}

export async function adminSendTestEmail() {
  const admin = await requireAdminUser("/dashboard/admin/emails");
  const requestContext = await getRequestContext();
  const rule = getRateLimitRuleForTier("ADMIN", "test_email");
  const limit = await checkRateLimit({
    ...rule,
    key: createRateLimitKey({
      action: "test_email",
      ip: requestContext.ip,
      route: "adminSendTestEmail",
      userId: admin.id,
    }),
  });

  if (!limit.allowed) {
    await logAbuseEvent({
      eventType: "RATE_LIMIT_TRIGGERED",
      ipAddress: requestContext.ip,
      metadata: {
        action: "test_email",
        limit: limit.limit,
        resetAt: limit.resetAt.toISOString(),
      },
      reason: "Admin test email rate limit triggered.",
      severity: "WARNING",
      target: "adminSendTestEmail",
      userAgent: requestContext.userAgent,
      userId: admin.id,
    });
    throw new Error("Too many test emails. Try again later.");
  }

  const config = getEmailConfig();
  const recipient = isValidEmailAddress(config.adminNotificationEmail)
    ? config.adminNotificationEmail
    : admin.email;

  await sendEmail({
    dedupeKey: `admin-test-email:${admin.id}:${Date.now()}`,
    template: emailTemplates.adminTestEmail({
      adminEmail: admin.email,
      logsUrl: getAppUrl("/dashboard/admin/emails"),
      provider: config.provider,
    }),
    templateKey: "admin.test-email",
    to: recipient,
    userId: admin.id,
  });

  revalidatePath("/dashboard/admin/emails");
  revalidatePath("/dashboard/admin/system");
}
