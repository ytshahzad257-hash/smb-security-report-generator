import { siteConfig } from "../site.ts";

export type EmailProvider = "smtp" | "console";

export type EmailConfig =
  | {
      configured: true;
      provider: "console";
      fromName: string;
      fromEmail: string;
      supportEmail: string | null;
      adminNotificationEmail: string | null;
    }
  | {
      configured: true;
      provider: "smtp";
      host: string;
      port: number;
      secure: boolean;
      user: string | null;
      password: string | null;
      fromName: string;
      fromEmail: string;
      supportEmail: string | null;
      adminNotificationEmail: string | null;
    }
  | {
      configured: false;
      provider: EmailProvider;
      fromName: string;
      fromEmail: string | null;
      supportEmail: string | null;
      adminNotificationEmail: string | null;
      reason: string;
    };

function clean(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

export function parseBoolean(value: string | undefined, fallback = false) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function isValidEmailAddress(email: string | null | undefined): email is string {
  if (!email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function maskEmail(email: string | null | undefined) {
  if (!email) {
    return "not-provided";
  }

  const [local, domain] = email.split("@");

  if (!local || !domain) {
    return "invalid-email";
  }

  const visibleLocal =
    local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;
  const domainParts = domain.split(".");
  const domainName = domainParts.shift() ?? "";
  const domainSuffix = domainParts.join(".");
  const visibleDomain =
    domainName.length <= 2
      ? `${domainName[0] ?? "*"}*`
      : `${domainName.slice(0, 2)}***`;

  return `${visibleLocal}@${visibleDomain}${domainSuffix ? `.${domainSuffix}` : ""}`;
}

export function getAppUrl(path = "/") {
  const configured = clean(process.env.APP_URL) ?? clean(process.env.NEXT_PUBLIC_APP_URL);
  const base = configured ?? "http://localhost:3000";

  try {
    return new URL(path, base).toString();
  } catch {
    return `http://localhost:3000${path.startsWith("/") ? path : `/${path}`}`;
  }
}

export function getEmailConfig(): EmailConfig {
  const providerValue = clean(process.env.EMAIL_PROVIDER)?.toLowerCase();
  const provider: EmailProvider = providerValue === "console" ? "console" : "smtp";
  const fromName = clean(process.env.SMTP_FROM_NAME) ?? siteConfig.name;
  const fromEmail = clean(process.env.SMTP_FROM_EMAIL);
  const supportEmail = clean(process.env.SUPPORT_EMAIL);
  const adminNotificationEmail = clean(process.env.ADMIN_NOTIFICATION_EMAIL);

  if (provider === "console") {
    return {
      configured: true,
      provider,
      fromName,
      fromEmail: fromEmail ?? "dev-notifications@example.test",
      supportEmail,
      adminNotificationEmail,
    };
  }

  const host = clean(process.env.SMTP_HOST);
  const port = Number(clean(process.env.SMTP_PORT));
  const user = clean(process.env.SMTP_USER);
  const password = clean(process.env.SMTP_PASSWORD);

  if (!host) {
    return {
      configured: false,
      provider,
      fromName,
      fromEmail,
      supportEmail,
      adminNotificationEmail,
      reason: "SMTP_HOST is not configured.",
    };
  }

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return {
      configured: false,
      provider,
      fromName,
      fromEmail,
      supportEmail,
      adminNotificationEmail,
      reason: "SMTP_PORT is not configured.",
    };
  }

  if (!isValidEmailAddress(fromEmail)) {
    return {
      configured: false,
      provider,
      fromName,
      fromEmail,
      supportEmail,
      adminNotificationEmail,
      reason: "SMTP_FROM_EMAIL is not configured.",
    };
  }

  if ((user && !password) || (!user && password)) {
    return {
      configured: false,
      provider,
      fromName,
      fromEmail,
      supportEmail,
      adminNotificationEmail,
      reason: "SMTP_USER and SMTP_PASSWORD must be configured together.",
    };
  }

  return {
    configured: true,
    provider,
    host,
    port,
    secure: parseBoolean(process.env.SMTP_SECURE, port === 465),
    user,
    password,
    fromName,
    fromEmail,
    supportEmail,
    adminNotificationEmail,
  };
}

export function getEmailHealthChecks() {
  return {
    emailProviderConfigured: Boolean(clean(process.env.EMAIL_PROVIDER)),
    smtpHostConfigured: Boolean(clean(process.env.SMTP_HOST)),
    smtpPortConfigured: Boolean(clean(process.env.SMTP_PORT)),
    smtpUserConfigured: Boolean(clean(process.env.SMTP_USER)),
    smtpFromEmailConfigured: Boolean(clean(process.env.SMTP_FROM_EMAIL)),
    adminNotificationEmailConfigured: Boolean(clean(process.env.ADMIN_NOTIFICATION_EMAIL)),
    supportEmailConfigured: Boolean(clean(process.env.SUPPORT_EMAIL)),
  };
}
