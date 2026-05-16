import type { EmailStatus } from "@prisma/client";

import {
  getEmailConfig,
  isValidEmailAddress,
  maskEmail,
  type EmailConfig,
} from "./emailConfig.ts";
import { sendWithEmailClient } from "./emailClient.ts";
import type { EmailTemplate } from "./emailTemplates.ts";
import { getPrisma } from "../prisma.ts";

export type NotificationPreferenceKey =
  | "paymentEmails"
  | "scanEmails"
  | "reportEmails"
  | "shareEmails"
  | "marketingEmails";

export type SendEmailInput = {
  to: string;
  templateKey: string;
  template: EmailTemplate;
  userId?: string | null;
  preferenceKey?: NotificationPreferenceKey;
  dedupeKey?: string | null;
};

export type SendEmailResult = {
  status: EmailStatus;
  success: boolean;
  errorMessage?: string;
  providerMessageId?: string | null;
};

function safeErrorMessage(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Email delivery failed.";

  return message
    .replace(/(pass(word)?|secret|token|key)=\S+/gi, "$1=[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);
}

function logSendDebug(input: {
  event: "called" | "result";
  provider: EmailConfig["provider"];
  status?: EmailStatus;
  templateKey: string;
  toEmail: string;
  errorMessage?: string | null;
}) {
  console.info("[email] send", {
    error: input.errorMessage ? safeErrorMessage(input.errorMessage) : undefined,
    event: input.event,
    provider: input.provider,
    status: input.status,
    templateKey: input.templateKey,
    to: maskEmail(input.toEmail),
  });
}

async function getExistingSentEmail(dedupeKey?: string | null) {
  if (!dedupeKey || !process.env.DATABASE_URL) {
    return null;
  }

  try {
    const prisma = getPrisma();

    return prisma.emailLog.findFirst({
      where: {
        dedupeKey,
        status: "SENT",
      },
      select: {
        id: true,
      },
    });
  } catch {
    return null;
  }
}

async function shouldSendForPreference(
  userId: string | null | undefined,
  preferenceKey: NotificationPreferenceKey | undefined,
) {
  if (!userId || !preferenceKey || !process.env.DATABASE_URL) {
    return true;
  }

  try {
    const prisma = getPrisma();
    const preference = await prisma.userNotificationPreference.findUnique({
      where: { userId },
      select: {
        marketingEmails: true,
        paymentEmails: true,
        reportEmails: true,
        scanEmails: true,
        shareEmails: true,
      },
    });

    return preference?.[preferenceKey] ?? true;
  } catch {
    return true;
  }
}

async function logEmail(input: {
  userId?: string | null;
  toEmail: string;
  templateKey: string;
  subject: string;
  status: EmailStatus;
  errorMessage?: string | null;
  providerMessageId?: string | null;
  dedupeKey?: string | null;
}) {
  if (!process.env.DATABASE_URL) {
    return;
  }

  try {
    const prisma = getPrisma();

    await prisma.emailLog.create({
      data: {
        dedupeKey: input.status === "SENT" ? input.dedupeKey ?? null : null,
        errorMessage: input.errorMessage ?? null,
        providerMessageId: input.providerMessageId ?? null,
        status: input.status,
        subject: input.subject,
        templateKey: input.templateKey,
        toEmail: maskEmail(input.toEmail),
        userId: input.userId ?? null,
      },
    });
  } catch {
    return;
  }
}

function skippedResult(errorMessage: string): SendEmailResult {
  return {
    errorMessage,
    status: "SKIPPED",
    success: false,
  };
}

function buildFrom(config: Extract<EmailConfig, { configured: true }>) {
  return {
    email: config.fromEmail,
    name: config.fromName,
  };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const normalizedRecipient = input.to.trim().toLowerCase();
  const config = getEmailConfig();

  logSendDebug({
    event: "called",
    provider: config.provider,
    templateKey: input.templateKey,
    toEmail: normalizedRecipient,
  });

  if (!isValidEmailAddress(normalizedRecipient)) {
    const errorMessage = "Recipient email is invalid.";

    await logEmail({
      errorMessage,
      status: "SKIPPED",
      subject: input.template.subject,
      templateKey: input.templateKey,
      toEmail: normalizedRecipient || "invalid",
      userId: input.userId,
    });
    logSendDebug({
      errorMessage,
      event: "result",
      provider: config.provider,
      status: "SKIPPED",
      templateKey: input.templateKey,
      toEmail: normalizedRecipient || "invalid",
    });

    return skippedResult(errorMessage);
  }

  const existingSentEmail = await getExistingSentEmail(input.dedupeKey);

  if (existingSentEmail) {
    const errorMessage = "Email was already sent for this event.";

    await logEmail({
      errorMessage,
      status: "SKIPPED",
      subject: input.template.subject,
      templateKey: input.templateKey,
      toEmail: normalizedRecipient,
      userId: input.userId,
    });
    logSendDebug({
      errorMessage,
      event: "result",
      provider: config.provider,
      status: "SKIPPED",
      templateKey: input.templateKey,
      toEmail: normalizedRecipient,
    });

    return skippedResult(errorMessage);
  }

  const preferenceAllowsEmail = await shouldSendForPreference(
    input.userId,
    input.preferenceKey,
  );

  if (!preferenceAllowsEmail) {
    await logEmail({
      errorMessage: "User notification preference disabled this email.",
      status: "SKIPPED",
      subject: input.template.subject,
      templateKey: input.templateKey,
      toEmail: normalizedRecipient,
      userId: input.userId,
    });
    logSendDebug({
      errorMessage: "User notification preference disabled this email.",
      event: "result",
      provider: config.provider,
      status: "SKIPPED",
      templateKey: input.templateKey,
      toEmail: normalizedRecipient,
    });

    return skippedResult("User notification preference disabled this email.");
  }

  if (!config.configured) {
    console.warn("[email] send skipped; provider is not configured", {
      provider: config.provider,
      reason: config.reason,
      templateKey: input.templateKey,
      to: maskEmail(normalizedRecipient),
    });
    await logEmail({
      errorMessage: config.reason,
      status: "SKIPPED",
      subject: input.template.subject,
      templateKey: input.templateKey,
      toEmail: normalizedRecipient,
      userId: input.userId,
    });
    logSendDebug({
      errorMessage: config.reason,
      event: "result",
      provider: config.provider,
      status: "SKIPPED",
      templateKey: input.templateKey,
      toEmail: normalizedRecipient,
    });

    return skippedResult(config.reason);
  }

  try {
    const result = await sendWithEmailClient(config, {
      from: buildFrom(config),
      html: input.template.html,
      replyTo: config.supportEmail,
      subject: input.template.subject,
      text: input.template.text,
      to: normalizedRecipient,
    });

    if (!result.success) {
      const errorMessage = safeErrorMessage(result.errorMessage);

      await logEmail({
        errorMessage,
        status: "FAILED",
        subject: input.template.subject,
        templateKey: input.templateKey,
        toEmail: normalizedRecipient,
        userId: input.userId,
      });
      console.warn("[email] send failed", {
        error: errorMessage,
        provider: config.provider,
        templateKey: input.templateKey,
        to: maskEmail(normalizedRecipient),
      });
      logSendDebug({
        errorMessage,
        event: "result",
        provider: config.provider,
        status: "FAILED",
        templateKey: input.templateKey,
        toEmail: normalizedRecipient,
      });

      return {
        errorMessage,
        status: "FAILED",
        success: false,
      };
    }

    await logEmail({
      dedupeKey: input.dedupeKey,
      providerMessageId: result.providerMessageId,
      status: "SENT",
      subject: input.template.subject,
      templateKey: input.templateKey,
      toEmail: normalizedRecipient,
      userId: input.userId,
    });
    logSendDebug({
      event: "result",
      provider: config.provider,
      status: "SENT",
      templateKey: input.templateKey,
      toEmail: normalizedRecipient,
    });

    return {
      providerMessageId: result.providerMessageId,
      status: "SENT",
      success: true,
    };
  } catch (error) {
    const errorMessage = safeErrorMessage(error);

    await logEmail({
      errorMessage,
      status: "FAILED",
      subject: input.template.subject,
      templateKey: input.templateKey,
      toEmail: normalizedRecipient,
      userId: input.userId,
    });
    console.warn("[email] send failed", {
      error: errorMessage,
      provider: config.provider,
      templateKey: input.templateKey,
      to: maskEmail(normalizedRecipient),
    });
    logSendDebug({
      errorMessage,
      event: "result",
      provider: config.provider,
      status: "FAILED",
      templateKey: input.templateKey,
      toEmail: normalizedRecipient,
    });

    return {
      errorMessage,
      status: "FAILED",
      success: false,
    };
  }
}
