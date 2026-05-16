import type { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import { hashRateLimitPart } from "./rateLimit.ts";

export type AbuseSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

export type AbuseEventType =
  | "RATE_LIMIT_TRIGGERED"
  | "BLOCKED_SCAN_TARGET"
  | "BLOCKED_PRIVATE_IP_SCAN"
  | "BLOCKED_LOCALHOST_SCAN"
  | "BLOCKED_UNSAFE_PROTOCOL"
  | "BLOCKED_TOO_MANY_REDIRECTS"
  | "BLOCKED_PROFESSIONAL_SCAN_ATTEMPT"
  | "PLAN_SCAN_ACCESS_BLOCKED"
  | "PLAN_SCAN_LIMIT_REACHED"
  | "PLAN_PDF_ACCESS_BLOCKED"
  | "PLAN_WHITE_LABEL_ACCESS_BLOCKED"
  | "PLAN_CLIENT_ACCESS_BLOCKED"
  | "PLAN_SHARE_ACCESS_BLOCKED"
  | "PLAN_MANUAL_REVIEW_BLOCKED"
  | "PLAN_POWERED_BY_HIDE_BLOCKED"
  | "PDF_RATE_LIMIT_TRIGGERED"
  | "SHARE_PASSWORD_RATE_LIMIT"
  | "PAYMENT_PROOF_RATE_LIMIT"
  | "WEBHOOK_REPLAY_BLOCKED"
  | "WEBHOOK_INVALID_SIGNATURE"
  | "UNAUTHORIZED_ADMIN_ACCESS"
  | "FAILED_AUTH_ATTEMPTS";

const sensitiveKeyPattern =
  /(authorization|body|cookie|hash|key|password|path|payload|raw|secret|signature|token|url)$/i;

function sanitizeString(value: string) {
  return value
    .replace(/(bearer|basic)\s+[a-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/(pass(word)?|secret|token|key|signature)=\S+/gi, "$1=[redacted]")
    .replace(/[A-Z]:\\[^\s",}]+/g, "[path redacted]")
    .replace(/\/(?:[^/\s",}]+\/){2,}[^/\s",}]+/g, "[path redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeMetadataValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 40)
        .map(([key, item]) => [
          key,
          sensitiveKeyPattern.test(key) ? "[redacted]" : sanitizeMetadataValue(item),
        ]),
    );
  }

  return String(value).slice(0, 120);
}

export function safeAbuseMetadata(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(sanitizeMetadataValue(value ?? {}))) as Prisma.InputJsonValue;
}

export function safeAbuseTarget(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);

    return parsed.hostname.toLowerCase().slice(0, 255);
  } catch {
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) {
      return trimmed.toLowerCase().slice(0, 255);
    }

    if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
      return `hash:${hashRateLimitPart(trimmed)}`;
    }

    return sanitizeString(trimmed.replace(/[/?#].*$/, "")).slice(0, 255);
  }
}

export async function logAbuseEvent(input: {
  eventType: AbuseEventType;
  ipAddress?: string | null;
  metadata?: unknown;
  reason: string;
  severity?: AbuseSeverity;
  target?: string | null;
  userAgent?: string | null;
  userId?: string | null;
}) {
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    const target = safeAbuseTarget(input.target);
    const prisma = getPrisma();

    await prisma.abuseLog.create({
      data: {
        eventType: input.eventType,
        ipAddress: input.ipAddress ?? null,
        metadata:
          input.metadata === undefined
            ? undefined
            : safeAbuseMetadata(input.metadata),
        reason: sanitizeString(input.reason),
        severity: input.severity ?? "INFO",
        target,
        targetUrl: target,
        userAgent: input.userAgent
          ? sanitizeString(input.userAgent).slice(0, 300)
          : null,
        userId: input.userId ?? null,
      },
    });
  } catch {
    return;
  }
}
