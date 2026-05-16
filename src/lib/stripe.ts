import { createHmac, timingSafeEqual } from "crypto";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export type StripeCheckoutMode = "payment" | "subscription";

export type StripeConfigStatus = {
  secretKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
  publishableKeyConfigured: boolean;
  checkoutConfigured: boolean;
};

export type StripeCustomer = {
  id: string;
  email?: string | null;
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  mode: StripeCheckoutMode;
  customer?: string | StripeCustomer | null;
  subscription?: string | { id: string } | null;
  payment_intent?: string | { id: string } | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
};

export type StripePortalSession = {
  id: string;
  url: string;
};

export type StripeSubscription = {
  id: string;
  customer?: string | StripeCustomer | null;
  status?: string | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
  metadata?: Record<string, string> | null;
};

export type StripeInvoice = {
  id: string;
  customer?: string | StripeCustomer | null;
  subscription?: string | StripeSubscription | null;
  payment_intent?: string | { id: string } | null;
  status?: string | null;
  amount_paid?: number | null;
  amount_due?: number | null;
  currency?: string | null;
  billing_reason?: string | null;
  metadata?: Record<string, string> | null;
  subscription_details?: {
    metadata?: Record<string, string> | null;
  } | null;
  lines?: {
    data?: Array<{
      period?: {
        start?: number | null;
        end?: number | null;
      } | null;
    }>;
  } | null;
};

export type StripeEventPayload = {
  id: string;
  type: string;
  data: {
    object: unknown;
  };
};

export class StripeConfigError extends Error {
  constructor(message = "Stripe is not configured.") {
    super(message);
    this.name = "StripeConfigError";
  }
}

export class StripeApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StripeApiError";
    this.status = status;
  }
}

export function getStripeConfigStatus(): StripeConfigStatus {
  const secretKeyConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const webhookSecretConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const publishableKeyConfigured = Boolean(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  );

  return {
    secretKeyConfigured,
    webhookSecretConfigured,
    publishableKeyConfigured,
    checkoutConfigured:
      secretKeyConfigured && webhookSecretConfigured && publishableKeyConfigured,
  };
}

export function getStripeUnavailableMessage() {
  return "Card payment is not available right now.";
}

function getStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new StripeConfigError();
  }

  return secretKey;
}

export function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    throw new StripeConfigError("Stripe webhook signing secret is not configured.");
  }

  return webhookSecret;
}

function appendStripeFormValue(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | null | undefined,
) {
  if (value === null || value === undefined || value === "") {
    return;
  }

  params.append(key, String(value));
}

function toStripeFormBody(values: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    appendStripeFormValue(params, key, value);
  }

  return params;
}

async function stripeRequest<T>(
  path: string,
  init: {
    method?: "GET" | "POST";
    body?: Record<string, string | number | boolean | null | undefined>;
  } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      ...(method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: method === "POST" ? toStripeFormBody(init.body ?? {}) : undefined,
  });
  const data = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new StripeApiError(
      data?.error?.message ?? "Stripe request failed.",
      response.status,
    );
  }

  return data as T;
}

export async function createStripeCustomer(input: {
  email: string;
  name?: string | null;
  userId: string;
}) {
  return stripeRequest<StripeCustomer>("/customers", {
    method: "POST",
    body: {
      email: input.email,
      name: input.name ?? undefined,
      "metadata[userId]": input.userId,
    },
  });
}

export async function createStripeCheckoutSession(input: {
  customerId: string;
  priceId: string;
  mode: StripeCheckoutMode;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}) {
  const metadataEntries = Object.fromEntries(
    Object.entries(input.metadata).flatMap(([key, value]) => [
      [`metadata[${key}]`, value],
      input.mode === "subscription"
        ? [`subscription_data[metadata][${key}]`, value]
        : [`payment_intent_data[metadata][${key}]`, value],
    ]),
  );

  return stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
    method: "POST",
    body: {
      customer: input.customerId,
      mode: input.mode,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][price]": input.priceId,
      "line_items[0][quantity]": 1,
      ...metadataEntries,
    },
  });
}

export async function createStripePortalSession(input: {
  customerId: string;
  returnUrl: string;
}) {
  return stripeRequest<StripePortalSession>("/billing_portal/sessions", {
    method: "POST",
    body: {
      customer: input.customerId,
      return_url: input.returnUrl,
    },
  });
}

export async function retrieveStripeSubscription(subscriptionId: string) {
  return stripeRequest<StripeSubscription>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

export function normalizeStripeId(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }

  return null;
}

export function stripeTimestampToDate(timestamp: number | null | undefined) {
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000)
    : null;
}

export function computeStripeSignature(rawBody: string, secret: string, timestamp: number) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

function safeCompareHex(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyStripeWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}) {
  const signatureHeader = input.signatureHeader;

  if (!signatureHeader || !input.webhookSecret) {
    return false;
  }

  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));
  const timestamp = Number(timestampPart?.slice(2));

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    return false;
  }

  const toleranceSeconds =
    input.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (
    toleranceSeconds > 0 &&
    Math.abs(nowSeconds - timestamp) > toleranceSeconds
  ) {
    return false;
  }

  const expected = computeStripeSignature(
    input.rawBody,
    input.webhookSecret,
    timestamp,
  );

  return signatures.some((signature) => safeCompareHex(expected, signature));
}

export function constructStripeWebhookEvent(input: {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
}) {
  if (!verifyStripeWebhookSignature(input)) {
    throw new Error("Invalid Stripe webhook signature.");
  }

  return JSON.parse(input.rawBody) as StripeEventPayload;
}

export function maskStripeId(value: string | null | undefined) {
  if (!value) {
    return "None";
  }

  if (value.length <= 10) {
    return `${value.slice(0, 4)}...`;
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}
