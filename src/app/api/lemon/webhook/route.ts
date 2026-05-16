import { NextResponse } from "next/server";

import { handleLemonWebhookEvent } from "@/lib/lemon-billing";
import {
  constructLemonWebhookEvent,
  getLemonWebhookSecret,
  safeLemonErrorMessage,
} from "@/lib/lemon";
import { logAbuseEvent } from "@/lib/security/abuseLog";
import { getRateLimitRuleForTier } from "@/lib/security/limits";
import {
  checkRateLimit,
  createRateLimitKey,
  getRequestContext,
  rateLimitResponseHeaders,
} from "@/lib/security/rateLimit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-signature");
  const headerEventName = request.headers.get("x-event-name");
  const requestContext = await getRequestContext(request);

  let event;

  try {
    event = constructLemonWebhookEvent({
      rawBody,
      signatureHeader,
      webhookSecret: getLemonWebhookSecret(),
    });
  } catch {
    const rule = getRateLimitRuleForTier("FREE_DEMO", "webhook_invalid_signature");
    const limit = await checkRateLimit({
      ...rule,
      key: createRateLimitKey({
        action: "webhook_invalid_signature",
        ip: requestContext.ip,
        route: "/api/lemon/webhook",
      }),
    });

    await logAbuseEvent({
      eventType: limit.allowed ? "WEBHOOK_INVALID_SIGNATURE" : "RATE_LIMIT_TRIGGERED",
      ipAddress: requestContext.ip,
      metadata: {
        action: "webhook_invalid_signature",
        limit: limit.limit,
        provider: "LEMON",
        resetAt: limit.resetAt.toISOString(),
      },
      reason: "Invalid Lemon Squeezy webhook signature rejected.",
      severity: limit.allowed ? "HIGH" : "CRITICAL",
      target: "lemon-webhook",
      userAgent: requestContext.userAgent,
    });

    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many invalid webhook attempts.", success: false },
        { headers: rateLimitResponseHeaders(limit), status: 429 },
      );
    }

    return NextResponse.json(
      { error: "Invalid Lemon Squeezy webhook signature.", success: false },
      { status: 400 },
    );
  }

  try {
    const result = await handleLemonWebhookEvent({
      event,
      rawBody,
      headerEventName,
    });

    if (result.duplicate) {
      await logAbuseEvent({
        eventType: "WEBHOOK_REPLAY_BLOCKED",
        ipAddress: requestContext.ip,
        metadata: {
          eventName: headerEventName,
          provider: "LEMON",
        },
        reason: "Duplicate Lemon Squeezy webhook event ignored.",
        severity: "INFO",
        target: "lemon-webhook",
        userAgent: requestContext.userAgent,
      });
    }

    return NextResponse.json({ ...result, received: true, success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: safeLemonErrorMessage(error),
        success: false,
      },
      { status: 500 },
    );
  }
}
