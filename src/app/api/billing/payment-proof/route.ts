import { NextResponse } from "next/server";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import { getUserSubscription } from "@/lib/billing";
import { savePaymentProof, validateProofFile } from "@/lib/manual-payments";
import { logAbuseEvent } from "@/lib/security/abuseLog";
import {
  getLimitTierForPlanSlug,
  getRateLimitRuleForTier,
} from "@/lib/security/limits";
import {
  checkRateLimit,
  createRateLimitKey,
  getRequestContext,
  rateLimitResponseHeaders,
} from "@/lib/security/rateLimit";

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
  const subscription = await getUserSubscription(user.id);
  const tier = getLimitTierForPlanSlug(subscription.plan.slug, user.role);
  const proofRule = getRateLimitRuleForTier(tier, "proof_upload");
  const proofLimit = await checkRateLimit({
    ...proofRule,
    key: createRateLimitKey({
      action: "proof_upload",
      ip: requestContext.ip,
      route: "/api/billing/payment-proof",
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

    return NextResponse.json(
      { error: "Too many proof upload attempts. Try again later.", success: false },
      { headers: rateLimitResponseHeaders(proofLimit), status: 429 },
    );
  }

  const formData = await request.formData();
  const proof = formData.get("proof");
  const proofFile = proof instanceof File ? proof : null;
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

  return NextResponse.json({
    proofToken: "uploaded",
    success: true,
  });
}
