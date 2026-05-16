import type { Prisma } from "@prisma/client";

import { getPrisma } from "../prisma.ts";

const DEFAULT_NOTIFICATION_LIMIT = 20;
const MAX_NOTIFICATION_LIMIT = 50;

const SENSITIVE_KEY_PATTERN = /(pass(word)?|secret|token|api[_-]?key|smtp|webhook|signature|payload|raw|path)/i;
const SENSITIVE_VALUE_PATTERN = /(bearer\s+[a-z0-9._-]+|sk_[a-z0-9]+|xox[baprs]-[a-z0-9-]+)/i;

export type CreateInAppNotificationInput = {
  userId: string;
  type: string;
  title: string;
  message: string;
  href?: string | null;
  metadata?: unknown;
};

export type NotificationPreferencesUpdateInput = Partial<{
  paymentEmails: boolean;
  scanEmails: boolean;
  reportEmails: boolean;
  shareEmails: boolean;
  inAppNotifications: boolean;
  marketingEmails: boolean;
}>;

export type NotificationListItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function safeNotificationError(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Notification operation failed.";

  return message
    .replace(/[A-Z]:\\[^\s]+/g, "[path redacted]")
    .replace(/\/(?:[^/\s]+\/){2,}[^/\s]+/g, "[path redacted]")
    .replace(/(pass(word)?|secret|token|key)=\S+/gi, "$1=[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
}

function sanitizeText(input: string) {
  return input
    .replace(/[\r\n\t]+/g, " ")
    .replace(SENSITIVE_VALUE_PATTERN, "[redacted]")
    .replace(/[A-Z]:\\[^\s]+/g, "[path redacted]")
    .replace(/\/(?:[^/\s]+\/){2,}[^/\s]+/g, "[path redacted]")
    .trim()
    .slice(0, 300);
}

function sanitizeHref(href: string | null | undefined) {
  if (!href) {
    return null;
  }

  const trimmed = href.trim();

  if (!trimmed.startsWith("/")) {
    return null;
  }

  if (trimmed.length > 300) {
    return null;
  }

  return trimmed;
}

function sanitizeMetadataValue(value: unknown, depth = 0): Prisma.InputJsonValue | undefined {
  if (depth > 3) {
    return "[truncated]";
  }

  if (value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return sanitizeText(value).slice(0, 400);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const next = value
      .slice(0, 12)
      .map((item) => sanitizeMetadataValue(item, depth + 1))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined);

    return next;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key));

    const next: Record<string, Prisma.InputJsonValue> = {};

    for (const [key, child] of entries) {
      const sanitized = sanitizeMetadataValue(child, depth + 1);

      if (sanitized !== undefined) {
        next[key] = sanitized;
      }
    }

    return next as Prisma.InputJsonObject;
  }

  return undefined;
}

function sanitizeMetadata(metadata: unknown): Prisma.InputJsonObject | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = sanitizeMetadataValue(metadata);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Prisma.InputJsonObject;
}

function getEventKey(metadata: Prisma.InputJsonObject | null) {
  const eventKey = metadata?.eventKey;

  return typeof eventKey === "string" && eventKey.trim().length > 0
    ? sanitizeText(eventKey).slice(0, 180)
    : null;
}

function normalizeLimit(limit?: number) {
  if (!limit || Number.isNaN(limit)) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }

  return Math.max(1, Math.min(MAX_NOTIFICATION_LIMIT, Math.trunc(limit)));
}

export async function getOrCreateNotificationPreferences(userId: string) {
  const prisma = getPrisma();

  return prisma.userNotificationPreference.upsert({
    where: { userId },
    update: {},
    create: {
      inAppNotifications: true,
      marketingEmails: false,
      paymentEmails: true,
      reportEmails: true,
      scanEmails: true,
      shareEmails: true,
      userId,
    },
  });
}

export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferencesUpdateInput,
) {
  const prisma = getPrisma();

  const next = {
    inAppNotifications: normalizeBoolean(input.inAppNotifications, true),
    marketingEmails: normalizeBoolean(input.marketingEmails, false),
    paymentEmails: normalizeBoolean(input.paymentEmails, true),
    reportEmails: normalizeBoolean(input.reportEmails, true),
    scanEmails: normalizeBoolean(input.scanEmails, true),
    shareEmails: normalizeBoolean(input.shareEmails, true),
  };

  return prisma.userNotificationPreference.upsert({
    where: { userId },
    update: next,
    create: {
      ...next,
      userId,
    },
  });
}

export async function createInAppNotification(input: CreateInAppNotificationInput) {
  const prisma = getPrisma();

  try {
    const safeType = sanitizeText(input.type).toLowerCase();
    const safeTitle = sanitizeText(input.title);
    const safeMessage = sanitizeText(input.message);
    const safeHref = sanitizeHref(input.href);
    const preference = await prisma.userNotificationPreference.findUnique({
      where: { userId: input.userId },
      select: {
        inAppNotifications: true,
      },
    });

    if (preference?.inAppNotifications === false) {
      return { created: false, reason: "preference_disabled" as const };
    }

    const safeMetadata = sanitizeMetadata(input.metadata);
    const eventKey = getEventKey(safeMetadata);

    if (eventKey) {
      const duplicate = await prisma.notification.findFirst({
        where: {
          metadata: {
            path: ["eventKey"],
            equals: eventKey,
          },
          type: safeType,
          userId: input.userId,
        },
        select: { id: true },
      });

      if (duplicate) {
        return { created: false, reason: "duplicate" as const };
      }
    }

    const notification = await prisma.notification.create({
      data: {
        href: safeHref,
        message: safeMessage,
        metadata: safeMetadata ?? undefined,
        title: safeTitle,
        type: safeType,
        userId: input.userId,
      },
      select: {
        id: true,
      },
    });

    return { created: true, id: notification.id };
  } catch (error) {
    console.warn("[notifications] create failed", {
      error: safeNotificationError(error),
      type: sanitizeText(input.type),
      userId: input.userId.slice(0, 12),
    });

    return { created: false, reason: "error" as const };
  }
}

export async function getUserNotifications(userId: string, limit?: number) {
  const prisma = getPrisma();

  return prisma.notification.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      createdAt: true,
      href: true,
      id: true,
      message: true,
      readAt: true,
      title: true,
      type: true,
    },
    take: normalizeLimit(limit),
    where: {
      userId,
    },
  }) as Promise<NotificationListItem[]>;
}

export async function getUnreadNotificationCount(userId: string) {
  const prisma = getPrisma();

  return prisma.notification.count({
    where: {
      readAt: null,
      userId,
    },
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const prisma = getPrisma();

  const result = await prisma.notification.updateMany({
    data: {
      readAt: new Date(),
    },
    where: {
      id: notificationId,
      readAt: null,
      userId,
    },
  });

  return { updated: result.count > 0 };
}

export async function markAllNotificationsRead(userId: string) {
  const prisma = getPrisma();

  const result = await prisma.notification.updateMany({
    data: {
      readAt: new Date(),
    },
    where: {
      readAt: null,
      userId,
    },
  });

  return { updatedCount: result.count };
}
