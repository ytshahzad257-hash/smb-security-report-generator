import { createHash, createHmac, timingSafeEqual } from "crypto";

const LEMON_API_BASE = "https://api.lemonsqueezy.com/v1";

export const LEMON_UNAVAILABLE_MESSAGE =
  "International card payment is not available yet. Manual payment remains available.";

export const LEMON_VARIANT_ENV_KEYS = {
  basicReport: "LEMONSQUEEZY_BASIC_REPORT_VARIANT_ID",
  proReport: "LEMONSQUEEZY_PRO_REPORT_VARIANT_ID",
  agencyStarter: "LEMONSQUEEZY_AGENCY_STARTER_VARIANT_ID",
  agencyPro: "LEMONSQUEEZY_AGENCY_PRO_VARIANT_ID",
  manualReview: "LEMONSQUEEZY_MANUAL_REVIEW_VARIANT_ID",
  credits5: "LEMONSQUEEZY_5_CREDITS_VARIANT_ID",
  credits10: "LEMONSQUEEZY_10_CREDITS_VARIANT_ID",
  credits25: "LEMONSQUEEZY_25_CREDITS_VARIANT_ID",
} as const;

const planSlugToVariantKey = {
  "basic-report": "basicReport",
  "pro-report": "proReport",
  "agency-starter": "agencyStarter",
  "agency-pro": "agencyPro",
  "manual-review-addon": "manualReview",
} as const;

const packageSlugToVariantKey = {
  "credits-5": "credits5",
  "credits-10": "credits10",
  "credits-25": "credits25",
} as const;

type LemonVariantKey = keyof typeof LEMON_VARIANT_ENV_KEYS;

export type LemonCheckoutMode = "payment" | "subscription";

export type LemonAppPaymentType =
  | "one_time_plan"
  | "subscription"
  | "credit_package";

export type LemonConfigStatus = {
  apiKeyConfigured: boolean;
  storeIdConfigured: boolean;
  webhookSecretConfigured: boolean;
  variantsConfigured: Record<LemonVariantKey, boolean>;
  allVariantIdsConfigured: boolean;
  checkoutConfigured: boolean;
};

export type LemonCheckoutCustomData = {
  userId: string;
  planId: string;
  packageKey: string;
  credits: string;
  appPaymentType: LemonAppPaymentType;
  paymentId?: string;
  packageId?: string;
};

export type LemonCheckout = {
  id: string;
  url: string | null;
};

export type LemonCheckoutApiResponse = {
  data?: {
    id?: string;
    attributes?: {
      url?: string | null;
    };
  };
};

export type LemonWebhookEvent = {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown> | null;
  } | null;
  data?: {
    type?: string;
    id?: string;
    attributes?: Record<string, unknown> | null;
  } | null;
};

export class LemonConfigError extends Error {
  constructor(message = "International card payment is not configured yet.") {
    super(message);
    this.name = "LemonConfigError";
  }
}

export class LemonApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LemonApiError";
    this.status = status;
  }
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function getLemonApiKey() {
  const apiKey = readEnv("LEMONSQUEEZY_API_KEY");

  if (!apiKey) {
    throw new LemonConfigError();
  }

  return apiKey;
}

export function getLemonStoreId() {
  const storeId = readEnv("LEMONSQUEEZY_STORE_ID");

  if (!storeId) {
    throw new LemonConfigError();
  }

  return storeId;
}

export function getLemonWebhookSecret() {
  const webhookSecret = readEnv("LEMONSQUEEZY_WEBHOOK_SECRET");

  if (!webhookSecret) {
    throw new LemonConfigError("Lemon Squeezy webhook signing secret is not configured.");
  }

  return webhookSecret;
}

export function getLemonVariantId(key: LemonVariantKey) {
  return readEnv(LEMON_VARIANT_ENV_KEYS[key]);
}

export function getLemonVariantIdForPlanSlug(slug: string) {
  const key = planSlugToVariantKey[slug as keyof typeof planSlugToVariantKey];

  return key ? getLemonVariantId(key) : "";
}

export function getLemonVariantIdForCreditPackageSlug(slug: string) {
  const key = packageSlugToVariantKey[slug as keyof typeof packageSlugToVariantKey];

  return key ? getLemonVariantId(key) : "";
}

export function getPlanSlugForLemonVariantId(variantId: string | null | undefined) {
  if (!variantId) {
    return null;
  }

  const match = Object.entries(planSlugToVariantKey).find(
    ([, key]) => getLemonVariantId(key) === variantId,
  );

  return match?.[0] ?? null;
}

export function getLemonConfigStatus(): LemonConfigStatus {
  const variantsConfigured = Object.fromEntries(
    Object.keys(LEMON_VARIANT_ENV_KEYS).map((key) => [
      key,
      Boolean(getLemonVariantId(key as LemonVariantKey)),
    ]),
  ) as Record<LemonVariantKey, boolean>;
  const allVariantIdsConfigured = Object.values(variantsConfigured).every(Boolean);
  const apiKeyConfigured = Boolean(readEnv("LEMONSQUEEZY_API_KEY"));
  const storeIdConfigured = Boolean(readEnv("LEMONSQUEEZY_STORE_ID"));
  const webhookSecretConfigured = Boolean(readEnv("LEMONSQUEEZY_WEBHOOK_SECRET"));

  return {
    apiKeyConfigured,
    storeIdConfigured,
    webhookSecretConfigured,
    variantsConfigured,
    allVariantIdsConfigured,
    checkoutConfigured:
      apiKeyConfigured &&
      storeIdConfigured &&
      webhookSecretConfigured &&
      allVariantIdsConfigured,
  };
}

export function getLemonHealthChecks() {
  const status = getLemonConfigStatus();

  return {
    lemonSqueezyApiKeyConfigured: status.apiKeyConfigured,
    lemonSqueezyStoreIdConfigured: status.storeIdConfigured,
    lemonSqueezyWebhookSecretConfigured: status.webhookSecretConfigured,
    lemonSqueezyVariantIdsConfigured: status.allVariantIdsConfigured,
    lemonSqueezyBasicReportVariantIdConfigured: status.variantsConfigured.basicReport,
    lemonSqueezyProReportVariantIdConfigured: status.variantsConfigured.proReport,
    lemonSqueezyAgencyStarterVariantIdConfigured:
      status.variantsConfigured.agencyStarter,
    lemonSqueezyAgencyProVariantIdConfigured: status.variantsConfigured.agencyPro,
    lemonSqueezyManualReviewVariantIdConfigured:
      status.variantsConfigured.manualReview,
    lemonSqueezy5CreditsVariantIdConfigured: status.variantsConfigured.credits5,
    lemonSqueezy10CreditsVariantIdConfigured: status.variantsConfigured.credits10,
    lemonSqueezy25CreditsVariantIdConfigured: status.variantsConfigured.credits25,
  };
}

export function getLemonUnavailableMessage() {
  return LEMON_UNAVAILABLE_MESSAGE;
}

export function ensureLemonCheckoutConfigured() {
  if (!getLemonConfigStatus().checkoutConfigured) {
    throw new LemonConfigError();
  }
}

function redactConfiguredSecrets(message: string) {
  return [
    readEnv("LEMONSQUEEZY_API_KEY"),
    readEnv("LEMONSQUEEZY_WEBHOOK_SECRET"),
  ].reduce(
    (safeMessage, secret) =>
      secret ? safeMessage.replaceAll(secret, "[redacted]") : safeMessage,
    message,
  );
}

export function safeLemonErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Lemon Squeezy processing failed.";

  return redactConfiguredSecrets(message).slice(0, 1000);
}

export function buildLemonCheckoutCustomData(input: {
  userId: string;
  planId?: string | null;
  packageId?: string | null;
  packageKey: string;
  credits: number;
  appPaymentType: LemonAppPaymentType;
  paymentId?: string;
}): LemonCheckoutCustomData {
  return {
    userId: input.userId,
    planId: input.planId ?? "",
    packageId: input.packageId ?? "",
    packageKey: input.packageKey,
    credits: String(input.credits),
    appPaymentType: input.appPaymentType,
    ...(input.paymentId ? { paymentId: input.paymentId } : {}),
  };
}

async function lemonRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${LEMON_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${getLemonApiKey()}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as
    | { errors?: Array<{ detail?: string; title?: string }> }
    | null;

  if (!response.ok) {
    const error = data?.errors?.[0];

    throw new LemonApiError(
      error?.detail ?? error?.title ?? "Lemon Squeezy request failed.",
      response.status,
    );
  }

  return data as T;
}

function numericVariantId(value: string) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function createLemonCheckout(input: {
  variantId: string;
  successUrl: string;
  email: string;
  name?: string | null;
  customData: LemonCheckoutCustomData;
}) {
  const enabledVariant = numericVariantId(input.variantId);
  const response = await lemonRequest<LemonCheckoutApiResponse>("/checkouts", {
    data: {
      type: "checkouts",
      attributes: {
        product_options: {
          redirect_url: input.successUrl,
          ...(enabledVariant ? { enabled_variants: [enabledVariant] } : {}),
        },
        checkout_options: {
          embed: false,
        },
        checkout_data: {
          email: input.email,
          name: input.name ?? undefined,
          custom: input.customData,
        },
      },
      relationships: {
        store: {
          data: {
            type: "stores",
            id: getLemonStoreId(),
          },
        },
        variant: {
          data: {
            type: "variants",
            id: input.variantId,
          },
        },
      },
    },
  });
  const checkoutId = response.data?.id;
  const checkoutUrl = response.data?.attributes?.url ?? null;

  if (!checkoutId || !checkoutUrl) {
    throw new LemonApiError("Lemon Squeezy checkout creation failed.", 502);
  }

  return {
    id: checkoutId,
    url: checkoutUrl,
  } satisfies LemonCheckout;
}

export function computeLemonSignature(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function safeCompareText(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyLemonWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
}) {
  if (!input.signatureHeader || !input.webhookSecret) {
    return false;
  }

  const expected = computeLemonSignature(input.rawBody, input.webhookSecret);

  return safeCompareText(expected, input.signatureHeader);
}

export function constructLemonWebhookEvent(input: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
}) {
  if (!verifyLemonWebhookSignature(input)) {
    throw new Error("Invalid Lemon Squeezy webhook signature.");
  }

  return JSON.parse(input.rawBody) as LemonWebhookEvent;
}

export function getLemonEventName(event: LemonWebhookEvent, headerEventName?: string | null) {
  return headerEventName || event.meta?.event_name || "unknown";
}

export function getLemonEventStorageKey(input: {
  event: LemonWebhookEvent;
  rawBody: string;
  headerEventName?: string | null;
}) {
  const eventName = getLemonEventName(input.event, input.headerEventName);
  const dataType = input.event.data?.type ?? "unknown";
  const dataId = input.event.data?.id ?? "unknown";
  const bodyHash = createHash("sha256").update(input.rawBody).digest("hex").slice(0, 24);

  return `${eventName}:${dataType}:${dataId}:${bodyHash}`;
}

export function normalizeLemonId(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "object" && "id" in value) {
    return normalizeLemonId(value.id);
  }

  return null;
}

export function lemonDateToDate(value: unknown) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function maskLemonId(value: string | null | undefined) {
  if (!value) {
    return "None";
  }

  if (value.length <= 10) {
    return `${value.slice(0, 4)}...`;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}
