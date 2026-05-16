import { NextResponse } from "next/server";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import { getUserSubscription } from "@/lib/billing";
import { getPrisma } from "@/lib/prisma";
import {
  createManualPaymentRequest,
  deletePaymentProof,
  findPendingManualPaymentRequestForOption,
  savePaymentProof,
  validateProofFile,
} from "@/lib/manual-payments";
import { notifyManualPaymentSubmitted } from "@/lib/email/notifications";
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
  rateLimitResponseHeaders,
} from "@/lib/security/rateLimit";

function serializeRequest(request: {
  id: string;
  packageName: string;
  amount: unknown;
  currency: string;
  reportCredits: number;
  requestedPlanName: string | null;
  paymentMethod: string;
  transactionReference: string | null;
  payerName: string | null;
  payerPhone: string | null;
  proofUrl: string | null;
  status: string;
  adminNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...request,
    amount: String(request.amount),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }
  await assertActiveUser(user.id);

  const prisma = getPrisma();
  const requests = await prisma.manualPaymentRequest.findMany({
    where: {
      userId: user.id,
    },
    select: {
      id: true,
      packageName: true,
      amount: true,
      currency: true,
      reportCredits: true,
      requestedPlanName: true,
      paymentMethod: true,
      transactionReference: true,
      payerName: true,
      payerPhone: true,
      proofUrl: true,
      status: true,
      adminNote: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return NextResponse.json({
    requests: requests.map(serializeRequest),
    success: true,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }
  await assertActiveUser(user.id);

  const requestContext = await getRequestContext(request);
  const formData = await request.formData();
  const optionId = String(formData.get("optionId") ?? "");
  const subscription = await getUserSubscription(user.id);
  const tier = getLimitTierForPlanSlug(subscription.plan.slug, user.role);
  const paymentLimitRule = getRateLimitRuleForTier(tier, "payment_request");
  const paymentLimit = await checkRateLimit({
    ...paymentLimitRule,
    key: createRateLimitKey({
      action: "payment_request",
      ip: requestContext.ip,
      route: "/api/billing/payment-requests",
      userId: user.id,
    }),
  });
  const dailyPaymentLimit = await checkRateLimit({
    ...PAYMENT_REQUEST_DAILY_LIMIT,
    key: createRateLimitKey({
      action: "payment_request",
      ip: requestContext.ip,
      route: "/api/billing/payment-requests",
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
      reason: "Manual payment request API rate limit triggered.",
      severity: "WARNING",
      target: "manual-payment",
      userAgent: requestContext.userAgent,
      userId: user.id,
    });

    return NextResponse.json(
      { error: "Too many payment requests. Try again later.", success: false },
      { headers: rateLimitResponseHeaders(limit), status: 429 },
    );
  }

  const duplicatePending = await findPendingManualPaymentRequestForOption(
    user.id,
    optionId,
  );

  if (duplicatePending) {
    return NextResponse.json(
      {
        error: "A pending request already exists for this plan or package.",
        success: false,
      },
      { status: 400 },
    );
  }

  const proof = formData.get("proof");
  const proofFile = proof instanceof File ? proof : null;
  const proofLimitRule = getRateLimitRuleForTier(tier, "proof_upload");
  const proofLimit = await checkRateLimit({
    ...proofLimitRule,
    key: createRateLimitKey({
      action: "proof_upload",
      ip: requestContext.ip,
      route: "/api/billing/payment-requests",
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
      reason: "Payment proof upload API rate limit triggered.",
      severity: "WARNING",
      target: "manual-payment-proof",
      userAgent: requestContext.userAgent,
      userId: user.id,
    });

    return NextResponse.json(
      { error: "Too many proof upload attempts. Try again later.", success: false },
      { headers: rateLimitResponseHeaders(proofLimit), status: 429 },
    );
  }

  const proofValidation = validateProofFile(proofFile);

  if (!proofValidation.success) {
    return NextResponse.json(
      { error: proofValidation.error, success: false },
      { status: 400 },
    );
  }

  const savedProof = await savePaymentProof(user.id, proofFile);

  if (!savedProof.success) {
    return NextResponse.json(
      { error: savedProof.error, success: false },
      { status: savedProof.status },
    );
  }

  try {
    const paymentRequest = await createManualPaymentRequest({
      userId: user.id,
      optionId,
      paymentMethod: String(formData.get("paymentMethod") ?? ""),
      transactionReference: String(formData.get("transactionReference") ?? "").trim(),
      payerName: String(formData.get("payerName") ?? "").trim(),
      payerPhone: String(formData.get("payerPhone") ?? "").trim(),
      proofPath: savedProof.proofPath,
    });
    await notifyManualPaymentSubmitted(paymentRequest.id);

    return NextResponse.json({
      request: serializeRequest(paymentRequest),
      success: true,
    });
  } catch (error) {
    await deletePaymentProof(savedProof.proofPath);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Payment request could not be created.",
        success: false,
      },
      { status: 400 },
    );
  }
}
