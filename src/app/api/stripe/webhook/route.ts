import { NextResponse } from "next/server";

import { handleStripeWebhookEvent, safeStripeErrorMessage } from "@/lib/stripe-billing";
import { constructStripeWebhookEvent, getStripeWebhookSecret } from "@/lib/stripe";
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
  const signatureHeader = request.headers.get("stripe-signature");
  const requestContext = await getRequestContext(request);

  let event;

  try {
    event = constructStripeWebhookEvent({
      rawBody,
      signatureHeader,
      webhookSecret: getStripeWebhookSecret(),
    });
  } catch {
    const rule = getRateLimitRuleForTier("FREE_DEMO", "webhook_invalid_signature");
    const limit = await checkRateLimit({
      ...rule,
      key: createRateLimitKey({
        action: "webhook_invalid_signature",
        ip: requestContext.ip,
        route: "/api/stripe/webhook",
      }),
    });

    await logAbuseEvent({
      eventType: limit.allowed ? "WEBHOOK_INVALID_SIGNATURE" : "RATE_LIMIT_TRIGGERED",
      ipAddress: requestContext.ip,
      metadata: {
        action: "webhook_invalid_signature",
        limit: limit.limit,
        provider: "STRIPE",
        resetAt: limit.resetAt.toISOString(),
      },
      reason: "Invalid Stripe webhook signature rejected.",
      severity: limit.allowed ? "HIGH" : "CRITICAL",
      target: "stripe-webhook",
      userAgent: requestContext.userAgent,
    });

    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many invalid webhook attempts.", success: false },
        { headers: rateLimitResponseHeaders(limit), status: 429 },
      );
    }

    return NextResponse.json(
      { error: "Invalid Stripe webhook signature.", success: false },
      { status: 400 },
    );
  }

  try {
    const result = await handleStripeWebhookEvent(event);

    if (result.duplicate) {
      await logAbuseEvent({
        eventType: "WEBHOOK_REPLAY_BLOCKED",
        ipAddress: requestContext.ip,
        metadata: {
          eventId: event.id,
          eventType: event.type,
          provider: "STRIPE",
        },
        reason: "Duplicate Stripe webhook event ignored.",
        severity: "INFO",
        target: "stripe-webhook",
        userAgent: requestContext.userAgent,
      });
    }

    return NextResponse.json({ ...result, received: true, success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: safeStripeErrorMessage(error),
        success: false,
      },
      { status: 500 },
    );
  }
}
