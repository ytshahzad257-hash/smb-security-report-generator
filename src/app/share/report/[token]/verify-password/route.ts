import { NextResponse } from "next/server";

import { verifySharePassword } from "@/lib/reports/reportSharing";
import { logAbuseEvent } from "@/lib/security/abuseLog";
import { getRateLimitRuleForTier } from "@/lib/security/limits";
import {
  checkRateLimit,
  createRateLimitKey,
  getRequestContext,
} from "@/lib/security/rateLimit";

export async function POST(
  request: Request,
  segmentData: { params: Promise<{ token: string }> },
) {
  const { token } = await segmentData.params;
  const requestContext = await getRequestContext(request);
  const rule = getRateLimitRuleForTier("FREE_DEMO", "share_password_attempt");
  const limit = await checkRateLimit({
    ...rule,
    key: createRateLimitKey({
      action: "share_password_attempt",
      ip: requestContext.ip,
      route: "/share/report/[token]/verify-password",
      target: token,
    }),
  });
  const url = new URL(`/share/report/${token}`, request.url);

  if (!limit.allowed) {
    await logAbuseEvent({
      eventType: "SHARE_PASSWORD_RATE_LIMIT",
      ipAddress: requestContext.ip,
      metadata: {
        action: "share_password_attempt",
        limit: limit.limit,
        resetAt: limit.resetAt.toISOString(),
        tokenHash: true,
      },
      reason: "Shared report password attempts temporarily locked.",
      severity: "WARNING",
      target: token,
      userAgent: requestContext.userAgent,
    });

    url.searchParams.set("error", "invalid");

    return NextResponse.redirect(url, { status: 303 });
  }

  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const result = await verifySharePassword(token, password);

  if (result.ok) {
    return NextResponse.redirect(url, { status: 303 });
  }

  await logAbuseEvent({
    eventType: "SHARE_PASSWORD_RATE_LIMIT",
    ipAddress: requestContext.ip,
    metadata: {
      action: "share_password_attempt",
      blocked: false,
      reason: result.reason,
      tokenHash: true,
    },
    reason: "Shared report password attempt failed.",
    severity: "INFO",
    target: token,
    userAgent: requestContext.userAgent,
  });

  url.searchParams.set("error", "invalid");

  return NextResponse.redirect(url, { status: 303 });
}
