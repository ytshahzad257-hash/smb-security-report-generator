export const RATE_LIMIT_WINDOW = {
  minute: 60 * 1000,
  fifteenMinutes: 15 * 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
} as const;

export type RateLimitMode = "fixed" | "sliding";

export type RateLimitRule = {
  limit: number;
  lockoutMs?: number;
  mode: RateLimitMode;
  windowMs: number;
};

export type PlanLimitTier =
  | "FREE_DEMO"
  | "BASIC_REPORT"
  | "PRO_REPORT"
  | "AGENCY_STARTER"
  | "AGENCY_PRO"
  | "ADMIN";

export type RateLimitAction =
  | "scan_submit"
  | "pdf_generate"
  | "share_password_attempt"
  | "share_download"
  | "payment_request"
  | "proof_upload"
  | "admin_write"
  | "test_email"
  | "auth_login"
  | "auth_signup"
  | "webhook_invalid_signature";

const commonSharePasswordLimit: RateLimitRule = {
  limit: 5,
  lockoutMs: 30 * 60 * 1000,
  mode: "sliding",
  windowMs: RATE_LIMIT_WINDOW.fifteenMinutes,
};

const commonShareDownloadLimit: RateLimitRule = {
  limit: 60,
  mode: "sliding",
  windowMs: RATE_LIMIT_WINDOW.fifteenMinutes,
};

const commonProofUploadLimit: RateLimitRule = {
  limit: 8,
  mode: "sliding",
  windowMs: RATE_LIMIT_WINDOW.hour,
};

const commonPaymentRequestLimit: RateLimitRule = {
  limit: 4,
  mode: "sliding",
  windowMs: RATE_LIMIT_WINDOW.hour,
};

export const PLAN_LIMITS: Record<
  PlanLimitTier,
  Record<RateLimitAction, RateLimitRule>
> = {
  FREE_DEMO: {
    admin_write: { limit: 0, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.hour },
    auth_login: { limit: 10, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.fifteenMinutes },
    auth_signup: { limit: 5, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    payment_request: commonPaymentRequestLimit,
    pdf_generate: { limit: 2, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    proof_upload: commonProofUploadLimit,
    scan_submit: { limit: 3, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.day },
    share_download: commonShareDownloadLimit,
    share_password_attempt: commonSharePasswordLimit,
    test_email: { limit: 0, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.hour },
    webhook_invalid_signature: {
      limit: 10,
      mode: "sliding",
      windowMs: RATE_LIMIT_WINDOW.fifteenMinutes,
    },
  },
  BASIC_REPORT: {
    admin_write: { limit: 0, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.hour },
    auth_login: { limit: 10, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.fifteenMinutes },
    auth_signup: { limit: 5, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    payment_request: commonPaymentRequestLimit,
    pdf_generate: { limit: 10, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    proof_upload: commonProofUploadLimit,
    scan_submit: { limit: 25, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.day },
    share_download: commonShareDownloadLimit,
    share_password_attempt: commonSharePasswordLimit,
    test_email: { limit: 0, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.hour },
    webhook_invalid_signature: {
      limit: 10,
      mode: "sliding",
      windowMs: RATE_LIMIT_WINDOW.fifteenMinutes,
    },
  },
  PRO_REPORT: {
    admin_write: { limit: 0, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.hour },
    auth_login: { limit: 10, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.fifteenMinutes },
    auth_signup: { limit: 5, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    payment_request: commonPaymentRequestLimit,
    pdf_generate: { limit: 20, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    proof_upload: commonProofUploadLimit,
    scan_submit: { limit: 50, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.day },
    share_download: commonShareDownloadLimit,
    share_password_attempt: commonSharePasswordLimit,
    test_email: { limit: 0, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.hour },
    webhook_invalid_signature: {
      limit: 10,
      mode: "sliding",
      windowMs: RATE_LIMIT_WINDOW.fifteenMinutes,
    },
  },
  AGENCY_STARTER: {
    admin_write: { limit: 0, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.hour },
    auth_login: { limit: 10, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.fifteenMinutes },
    auth_signup: { limit: 5, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    payment_request: commonPaymentRequestLimit,
    pdf_generate: { limit: 60, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    proof_upload: commonProofUploadLimit,
    scan_submit: { limit: 150, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.day },
    share_download: { limit: 180, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.fifteenMinutes },
    share_password_attempt: commonSharePasswordLimit,
    test_email: { limit: 0, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.hour },
    webhook_invalid_signature: {
      limit: 10,
      mode: "sliding",
      windowMs: RATE_LIMIT_WINDOW.fifteenMinutes,
    },
  },
  AGENCY_PRO: {
    admin_write: { limit: 0, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.hour },
    auth_login: { limit: 10, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.fifteenMinutes },
    auth_signup: { limit: 5, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    payment_request: commonPaymentRequestLimit,
    pdf_generate: { limit: 150, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    proof_upload: commonProofUploadLimit,
    scan_submit: { limit: 400, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.day },
    share_download: { limit: 300, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.fifteenMinutes },
    share_password_attempt: commonSharePasswordLimit,
    test_email: { limit: 0, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.hour },
    webhook_invalid_signature: {
      limit: 10,
      mode: "sliding",
      windowMs: RATE_LIMIT_WINDOW.fifteenMinutes,
    },
  },
  ADMIN: {
    admin_write: { limit: 120, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    auth_login: { limit: 20, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.fifteenMinutes },
    auth_signup: { limit: 10, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    payment_request: { limit: 10, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    pdf_generate: { limit: 200, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    proof_upload: { limit: 20, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    scan_submit: { limit: 1000, mode: "fixed", windowMs: RATE_LIMIT_WINDOW.day },
    share_download: { limit: 500, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.fifteenMinutes },
    share_password_attempt: commonSharePasswordLimit,
    test_email: { limit: 5, mode: "sliding", windowMs: RATE_LIMIT_WINDOW.hour },
    webhook_invalid_signature: {
      limit: 10,
      mode: "sliding",
      windowMs: RATE_LIMIT_WINDOW.fifteenMinutes,
    },
  },
};

export const PAYMENT_REQUEST_DAILY_LIMIT: RateLimitRule = {
  limit: 8,
  mode: "fixed",
  windowMs: RATE_LIMIT_WINDOW.day,
};

export const UNSAFE_TARGET_SUBMISSION_LIMIT: RateLimitRule = {
  limit: 5,
  lockoutMs: 30 * 60 * 1000,
  mode: "sliding",
  windowMs: RATE_LIMIT_WINDOW.fifteenMinutes,
};

export function getLimitTierForPlanSlug(
  planSlug: string | null | undefined,
  role?: string | null,
): PlanLimitTier {
  if (role === "ADMIN") {
    return "ADMIN";
  }

  switch (planSlug) {
    case "basic-report":
      return "BASIC_REPORT";
    case "pro-report":
      return "PRO_REPORT";
    case "agency-starter":
      return "AGENCY_STARTER";
    case "agency-pro":
      return "AGENCY_PRO";
    case "free-demo":
    default:
      return "FREE_DEMO";
  }
}

export function getRateLimitRuleForTier(
  tier: PlanLimitTier,
  action: RateLimitAction,
) {
  return PLAN_LIMITS[tier][action];
}
