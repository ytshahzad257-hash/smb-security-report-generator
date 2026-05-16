"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertActiveUser, requireAdmin, requireUser } from "@/lib/auth";
import { assertAdminWriteRateLimit } from "@/lib/admin";
import { getUserSubscription } from "@/lib/billing";
import {
  approveManualPaymentRequest,
  cancelManualPaymentRequest,
  createManualPaymentRequest,
  deletePaymentProof,
  findPendingManualPaymentRequestForOption,
  rejectManualPaymentRequest,
  savePaymentProof,
  validateProofFile,
} from "@/lib/manual-payments";
import {
  notifyManualPaymentApproved,
  notifyManualPaymentRejected,
  notifyManualPaymentSubmitted,
} from "@/lib/email/notifications";
import { logAbuseEvent } from "@/lib/security/abuseLog";
import {
  PAYMENT_REQUEST_DAILY_LIMIT,
  getLimitTierForPlanSlug,
  getRateLimitRuleForTier,
} from "@/lib/security/limits";
import {
  checkRateLimit,
  createRateLimitKey,
  getRequestContext,
} from "@/lib/security/rateLimit";

export type ManualPaymentState = {
  status?: "success" | "error";
  message?: string;
};

const manualPaymentSchema = z.object({
  optionId: z.string().min(1, "Select a plan or credit package."),
  paymentMethod: z.string().min(1, "Select a payment method."),
  transactionReference: z.string().trim().max(120).optional(),
  payerName: z.string().trim().max(120).optional(),
  payerPhone: z.string().trim().max(40).optional(),
});

const requestIdSchema = z.object({
  requestId: z.string().min(1),
});

const rejectionSchema = requestIdSchema.extend({
  adminNote: z.string().trim().min(3, "Enter a short rejection reason.").max(1000),
});

export async function submitManualPaymentRequest(
  _previousState: ManualPaymentState,
  formData: FormData,
): Promise<ManualPaymentState> {
  const user = await requireUser();
  await assertActiveUser(user.id);
  const validatedFields = manualPaymentSchema.safeParse({
    optionId: formData.get("optionId"),
    paymentMethod: formData.get("paymentMethod"),
    transactionReference: formData.get("transactionReference") || undefined,
    payerName: formData.get("payerName") || undefined,
    payerPhone: formData.get("payerPhone") || undefined,
  });

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;

    return {
      status: "error",
      message:
        fieldErrors.optionId?.[0] ??
        fieldErrors.paymentMethod?.[0] ??
        fieldErrors.transactionReference?.[0] ??
        fieldErrors.payerName?.[0] ??
        fieldErrors.payerPhone?.[0] ??
        "Check the payment request details and try again.",
    };
  }

  const requestContext = await getRequestContext();
  const subscription = await getUserSubscription(user.id);
  const tier = getLimitTierForPlanSlug(subscription.plan.slug, user.role);
  const paymentLimitRule = getRateLimitRuleForTier(tier, "payment_request");
  const paymentLimit = await checkRateLimit({
    ...paymentLimitRule,
    key: createRateLimitKey({
      action: "payment_request",
      ip: requestContext.ip,
      route: "submitManualPaymentRequest",
      userId: user.id,
    }),
  });
  const dailyPaymentLimit = await checkRateLimit({
    ...PAYMENT_REQUEST_DAILY_LIMIT,
    key: createRateLimitKey({
      action: "payment_request",
      ip: requestContext.ip,
      route: "submitManualPaymentRequest",
      scope: "daily",
      userId: user.id,
    }),
  });

  if (!paymentLimit.allowed || !dailyPaymentLimit.allowed) {
    const limit = paymentLimit.allowed ? dailyPaymentLimit : paymentLimit;

    await logAbuseEvent({
      eventType: "RATE_LIMIT_TRIGGERED",
      ipAddress: requestContext.ip,
      metadata: {
        action: "payment_request",
        limit: limit.limit,
        resetAt: limit.resetAt.toISOString(),
      },
      reason: "Manual payment request rate limit triggered.",
      severity: "WARNING",
      target: "manual-payment",
      userAgent: requestContext.userAgent,
      userId: user.id,
    });

    return {
      status: "error",
      message: "Too many payment requests. Try again later.",
    };
  }

  const duplicatePending = await findPendingManualPaymentRequestForOption(
    user.id,
    validatedFields.data.optionId,
  );

  if (duplicatePending) {
    return {
      status: "error",
      message: "A pending request already exists for this plan or package.",
    };
  }

  const proof = formData.get("proof");
  const proofFile = proof instanceof File ? proof : null;
  const proofRule = getRateLimitRuleForTier(tier, "proof_upload");
  const proofLimit = await checkRateLimit({
    ...proofRule,
    key: createRateLimitKey({
      action: "proof_upload",
      ip: requestContext.ip,
      route: "submitManualPaymentRequest",
      userId: user.id,
    }),
  });

  if (!proofLimit.allowed) {
    await logAbuseEvent({
      eventType: "PAYMENT_PROOF_RATE_LIMIT",
      ipAddress: requestContext.ip,
      metadata: {
        action: "proof_upload",
        limit: proofLimit.limit,
        resetAt: proofLimit.resetAt.toISOString(),
      },
      reason: "Payment proof upload rate limit triggered.",
      severity: "WARNING",
      target: "manual-payment-proof",
      userAgent: requestContext.userAgent,
      userId: user.id,
    });

    return {
      status: "error",
      message: "Too many proof upload attempts. Try again later.",
    };
  }

  const proofValidation = validateProofFile(proofFile);

  if (!proofValidation.success) {
    return {
      status: "error",
      message: proofValidation.error,
    };
  }

  const savedProof = await savePaymentProof(user.id, proofFile);

  if (!savedProof.success) {
    return {
      status: "error",
      message: savedProof.error,
    };
  }

  try {
    const paymentRequest = await createManualPaymentRequest({
      userId: user.id,
      optionId: validatedFields.data.optionId,
      paymentMethod: validatedFields.data.paymentMethod,
      transactionReference: validatedFields.data.transactionReference,
      payerName: validatedFields.data.payerName,
      payerPhone: validatedFields.data.payerPhone,
      proofPath: savedProof.proofPath,
    });
    await notifyManualPaymentSubmitted(paymentRequest.id);
  } catch (error) {
    await deletePaymentProof(savedProof.proofPath);

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Payment request could not be submitted.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/billing");

  return {
    status: "success",
    message:
      "Payment proof submitted. Your plan or credits will be activated after admin approval.",
  };
}

export async function cancelPendingPaymentRequest(formData: FormData) {
  const user = await requireUser();
  const validatedFields = requestIdSchema.safeParse({
    requestId: formData.get("requestId"),
  });

  if (!validatedFields.success) {
    throw new Error("Invalid payment request.");
  }

  await cancelManualPaymentRequest(user.id, validatedFields.data.requestId);
  revalidatePath("/dashboard/billing");
}

export async function approvePendingPaymentRequest(formData: FormData) {
  const admin = await requireAdmin();
  await assertAdminWriteRateLimit(admin.id, "approvePendingPaymentRequest");
  const validatedFields = requestIdSchema.safeParse({
    requestId: formData.get("requestId"),
  });

  if (!validatedFields.success) {
    throw new Error("Invalid payment request.");
  }

  const result = await approveManualPaymentRequest(admin.id, validatedFields.data.requestId);

  if (!result.alreadyApproved) {
    await notifyManualPaymentApproved(result.request.id);
  }

  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/admin/payments");
}

export async function rejectPendingPaymentRequest(formData: FormData) {
  const admin = await requireAdmin();
  await assertAdminWriteRateLimit(admin.id, "rejectPendingPaymentRequest");
  const validatedFields = rejectionSchema.safeParse({
    requestId: formData.get("requestId"),
    adminNote: formData.get("adminNote"),
  });

  if (!validatedFields.success) {
    throw new Error("Enter a rejection reason.");
  }

  const request = await rejectManualPaymentRequest(
    admin.id,
    validatedFields.data.requestId,
    validatedFields.data.adminNote,
  );
  await notifyManualPaymentRejected(request.id);

  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/admin/payments");
}
