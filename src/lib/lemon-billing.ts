import type {
  BillingType,
  CreditPackage,
  PaymentStatus,
  Plan,
  Prisma,
  Subscription,
  SubscriptionStatus,
} from "@prisma/client";

import { addMonths, addYears } from "./date.ts";
import {
  buildLemonCheckoutCustomData,
  createLemonCheckout,
  ensureLemonCheckoutConfigured,
  getLemonConfigStatus,
  getLemonEventName,
  getLemonEventStorageKey,
  getLemonStoreId,
  getLemonUnavailableMessage,
  getLemonVariantIdForCreditPackageSlug,
  getLemonVariantIdForPlanSlug,
  getPlanSlugForLemonVariantId,
  lemonDateToDate,
  maskLemonId,
  normalizeLemonId,
  safeLemonErrorMessage,
  type LemonAppPaymentType,
  type LemonWebhookEvent,
} from "./lemon.ts";
import { notifyPaymentActivated, notifyPaymentFailed } from "./email/notifications.ts";
import { getPrisma } from "./prisma.ts";

const FREE_PLAN_SLUG = "free-demo";
const CHECKOUT_SUCCESS_PATH = "/dashboard/billing?lemon=success";
const CHECKOUT_CANCEL_PATH = "/dashboard/billing?lemon=cancelled";

type CheckoutUser = {
  id: string;
  email: string;
  name: string | null;
};

type LemonCheckoutRequest = {
  planId?: string;
  packageId?: string;
  successUrl?: string;
  cancelUrl?: string;
};

type CheckoutSelection =
  | {
      kind: "plan";
      appPaymentType: "one_time_plan" | "subscription";
      plan: Plan;
      package: null;
      amount: string;
      currency: string;
      credits: number;
      displayName: string;
      packageKey: string;
      variantId: string;
    }
  | {
      kind: "credit_package";
      appPaymentType: "credit_package";
      plan: null;
      package: CreditPackage;
      amount: string;
      currency: string;
      credits: number;
      displayName: string;
      packageKey: string;
      variantId: string;
    };

type LemonEventRecord = {
  id: string;
  processingStatus: string;
};

type LemonAttributes = Record<string, unknown>;

function getPeriodEndForBillingType(billingType: BillingType, start: Date) {
  if (billingType === "MONTHLY" || billingType === "ADDON" || billingType === "ONE_TIME") {
    return addMonths(start, 1);
  }

  return addYears(start, 1);
}

export function resolvePlanLemonMode(plan: Pick<Plan, "billingType">) {
  return plan.billingType === "MONTHLY" ? "subscription" : "payment";
}

export function getLemonBillingStatus() {
  return {
    ...getLemonConfigStatus(),
    unavailableMessage: getLemonUnavailableMessage(),
  };
}

export function mapLemonSubscriptionStatus(
  lemonStatus: string | null | undefined,
): SubscriptionStatus {
  if (lemonStatus === "active" || lemonStatus === "on_trial") {
    return "ACTIVE";
  }

  if (lemonStatus === "past_due" || lemonStatus === "unpaid") {
    return "PAST_DUE";
  }

  if (lemonStatus === "cancelled" || lemonStatus === "expired") {
    return "CANCELLED";
  }

  return "INACTIVE";
}

export function shouldGrantLemonInvoiceCredits(input: {
  billingReason?: string | null;
  paymentStatus?: string | null;
}) {
  return input.paymentStatus === "paid" && input.billingReason === "renewal";
}

function isSafeClientRedirect(value: string | undefined, requestUrl: string) {
  if (!value) {
    return false;
  }

  if (value.startsWith("/")) {
    return true;
  }

  try {
    return new URL(value).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

function resolveBaseUrl(requestUrl: string) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();

  if (configuredUrl) {
    try {
      return new URL(configuredUrl).origin;
    } catch {
      return new URL(requestUrl).origin;
    }
  }

  return new URL(requestUrl).origin;
}

function resolveConfiguredRedirectUrl(
  configuredUrl: string | undefined,
  fallbackPath: string,
  requestUrl: string,
) {
  const baseUrl = resolveBaseUrl(requestUrl);

  if (!configuredUrl) {
    return `${baseUrl}${fallbackPath}`;
  }

  try {
    return new URL(configuredUrl).toString();
  } catch {
    return `${baseUrl}${configuredUrl.startsWith("/") ? configuredUrl : fallbackPath}`;
  }
}

function resolveCheckoutRedirectUrl(
  requestedUrl: string | undefined,
  configuredUrl: string | undefined,
  fallbackPath: string,
  requestUrl: string,
) {
  const baseUrl = resolveBaseUrl(requestUrl);

  if (isSafeClientRedirect(requestedUrl, requestUrl)) {
    if (requestedUrl?.startsWith("/")) {
      return `${baseUrl}${requestedUrl}`;
    }

    return requestedUrl as string;
  }

  return resolveConfiguredRedirectUrl(configuredUrl, fallbackPath, requestUrl);
}

async function resolveCheckoutSelection(input: LemonCheckoutRequest) {
  const prisma = getPrisma();

  if (input.planId && input.packageId) {
    throw new Error("Select either a plan or a credit package.");
  }

  if (!input.planId && !input.packageId) {
    throw new Error("Select a plan or credit package.");
  }

  if (input.planId) {
    const plan = await prisma.plan.findUnique({ where: { id: input.planId } });

    if (!plan || !plan.isActive) {
      throw new Error("Selected plan unavailable.");
    }

    if (plan.billingType === "FREE") {
      throw new Error("Free Demo does not require checkout.");
    }

    if (plan.reportCredits < 0) {
      throw new Error("Selected plan has invalid credits.");
    }

    ensureLemonCheckoutConfigured();

    const variantId = getLemonVariantIdForPlanSlug(plan.slug);

    if (!variantId) {
      throw new Error("Selected plan is not mapped to a Lemon Squeezy variant yet.");
    }

    return {
      kind: "plan",
      appPaymentType:
        plan.billingType === "MONTHLY" ? "subscription" : "one_time_plan",
      plan,
      package: null,
      amount: plan.price.toString(),
      currency: plan.currency,
      credits: plan.reportCredits,
      displayName: plan.name,
      packageKey: plan.slug,
      variantId,
    } satisfies CheckoutSelection;
  }

  const creditPackage =
    (await prisma.creditPackage.findUnique({
      where: { id: input.packageId },
    })) ??
    (await prisma.creditPackage.findUnique({
      where: { slug: input.packageId },
    }));

  if (!creditPackage || !creditPackage.isActive) {
    throw new Error("Selected credit package unavailable.");
  }

  if (creditPackage.reportCredits <= 0) {
    throw new Error("Selected credit package has invalid credits.");
  }

  ensureLemonCheckoutConfigured();

  const variantId = getLemonVariantIdForCreditPackageSlug(creditPackage.slug);

  if (!variantId) {
    throw new Error("Selected credit package is not mapped to a Lemon Squeezy variant yet.");
  }

  return {
    kind: "credit_package",
    appPaymentType: "credit_package",
    plan: null,
    package: creditPackage,
    amount: creditPackage.price.toString(),
    currency: creditPackage.currency,
    credits: creditPackage.reportCredits,
    displayName: creditPackage.name,
    packageKey: creditPackage.slug,
    variantId,
  } satisfies CheckoutSelection;
}

function assertLemonStoreMatches(attributes: LemonAttributes) {
  const storeId = normalizeLemonId(attributes.store_id);
  const configuredStoreId = getLemonStoreId();

  if (storeId && storeId !== configuredStoreId) {
    throw new Error("Lemon Squeezy webhook store does not match this app.");
  }
}

function readAttributes(event: LemonWebhookEvent) {
  return event.data?.attributes ?? {};
}

function readCustomData(event: LemonWebhookEvent) {
  return event.meta?.custom_data ?? {};
}

function readCustomString(customData: Record<string, unknown>, key: string) {
  const value = customData[key];

  return value === null || value === undefined ? "" : String(value);
}

function readLemonCustomerId(attributes: LemonAttributes) {
  return normalizeLemonId(attributes.customer_id);
}

function readLemonVariantId(attributes: LemonAttributes) {
  return normalizeLemonId(
    attributes.variant_id ??
      (attributes.first_order_item as { variant_id?: unknown } | undefined)?.variant_id,
  );
}

function readLemonProductId(attributes: LemonAttributes) {
  return normalizeLemonId(
    attributes.product_id ??
      (attributes.first_order_item as { product_id?: unknown } | undefined)?.product_id,
  );
}

function readCurrency(attributes: LemonAttributes, fallback: string) {
  const currency = attributes.currency;

  return typeof currency === "string" && currency ? currency.toUpperCase() : fallback;
}

function centsToDecimalAmount(cents: unknown, fallback: string) {
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return (cents / 100).toFixed(2);
  }

  return fallback;
}

async function ensureActiveSubscriptionForCredits(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date,
) {
  const activeSubscription = await tx.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });

  if (activeSubscription) {
    return activeSubscription;
  }

  const freePlan = await tx.plan.findUnique({
    where: { slug: FREE_PLAN_SLUG },
  });

  if (!freePlan) {
    throw new Error("Free Demo plan is not seeded.");
  }

  return tx.subscription.create({
    data: {
      userId,
      planId: freePlan.id,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: addYears(now, 1),
      creditsTotal: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
    },
  });
}

async function auditLemonEvent(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    reason?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.adminAuditLog
    .create({
      data: {
        adminUserId: input.userId,
        action: input.action,
        targetUserId: input.userId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        metadata: input.metadata,
      },
    })
    .catch(() => undefined);
}

async function markPendingPaymentForEvent(
  tx: Prisma.TransactionClient,
  input: {
    paymentId?: string;
    providerEventId: string;
    userId: string;
    planId?: string | null;
    creditPackageId?: string | null;
    packageName: string;
    amount: string;
    currency: string;
    status: PaymentStatus;
    credits: number;
    lemonOrderId?: string | null;
    lemonCheckoutId?: string | null;
    lemonSubscriptionId?: string | null;
    lemonCustomerId?: string | null;
    lemonVariantId?: string | null;
    lemonProductId?: string | null;
  },
) {
  if (input.paymentId) {
    const pendingPayment = await tx.payment.findFirst({
      where: {
        id: input.paymentId,
        userId: input.userId,
        provider: "LEMON",
      },
    });

    if (pendingPayment) {
      if (pendingPayment.status === "APPROVED") {
        return pendingPayment;
      }

      return tx.payment.update({
        where: { id: pendingPayment.id },
        data: {
          planId: input.planId ?? null,
          creditPackageId: input.creditPackageId ?? null,
          packageName: input.packageName,
          amount: input.amount,
          currency: input.currency,
          provider: "LEMON",
          method: "LEMON",
          status: input.status,
          reportCredits: input.credits,
          transactionRef:
            input.lemonOrderId ??
            input.lemonSubscriptionId ??
            input.lemonCheckoutId ??
            pendingPayment.transactionRef,
          providerEventId: input.providerEventId,
          lemonOrderId: input.lemonOrderId ?? pendingPayment.lemonOrderId,
          lemonCheckoutId: input.lemonCheckoutId ?? pendingPayment.lemonCheckoutId,
          lemonSubscriptionId:
            input.lemonSubscriptionId ?? pendingPayment.lemonSubscriptionId,
          lemonCustomerId: input.lemonCustomerId ?? pendingPayment.lemonCustomerId,
          lemonVariantId: input.lemonVariantId ?? pendingPayment.lemonVariantId,
          lemonProductId: input.lemonProductId ?? pendingPayment.lemonProductId,
        },
      });
    }
  }

  return tx.payment.upsert({
    where: { providerEventId: input.providerEventId },
    update: {
      planId: input.planId ?? null,
      creditPackageId: input.creditPackageId ?? null,
      packageName: input.packageName,
      amount: input.amount,
      currency: input.currency,
      provider: "LEMON",
      method: "LEMON",
      status: input.status,
      reportCredits: input.credits,
      transactionRef:
        input.lemonOrderId ?? input.lemonSubscriptionId ?? input.lemonCheckoutId,
      lemonOrderId: input.lemonOrderId,
      lemonCheckoutId: input.lemonCheckoutId,
      lemonSubscriptionId: input.lemonSubscriptionId,
      lemonCustomerId: input.lemonCustomerId,
      lemonVariantId: input.lemonVariantId,
      lemonProductId: input.lemonProductId,
    },
    create: {
      userId: input.userId,
      planId: input.planId ?? null,
      creditPackageId: input.creditPackageId ?? null,
      packageName: input.packageName,
      amount: input.amount,
      currency: input.currency,
      provider: "LEMON",
      method: "LEMON",
      status: input.status,
      reportCredits: input.credits,
      transactionRef:
        input.lemonOrderId ?? input.lemonSubscriptionId ?? input.lemonCheckoutId,
      providerEventId: input.providerEventId,
      lemonOrderId: input.lemonOrderId,
      lemonCheckoutId: input.lemonCheckoutId,
      lemonSubscriptionId: input.lemonSubscriptionId,
      lemonCustomerId: input.lemonCustomerId,
      lemonVariantId: input.lemonVariantId,
      lemonProductId: input.lemonProductId,
    },
  });
}

export async function createLemonCheckoutForUser(input: {
  user: CheckoutUser;
  checkout: LemonCheckoutRequest;
  requestUrl: string;
}) {
  const selection = await resolveCheckoutSelection(input.checkout);
  const successUrl = resolveCheckoutRedirectUrl(
    input.checkout.successUrl,
    undefined,
    CHECKOUT_SUCCESS_PATH,
    input.requestUrl,
  );
  const cancelUrl = resolveCheckoutRedirectUrl(
    input.checkout.cancelUrl,
    undefined,
    CHECKOUT_CANCEL_PATH,
    input.requestUrl,
  );
  const prisma = getPrisma();
  const pendingPayment = await prisma.payment.create({
    data: {
      userId: input.user.id,
      planId: selection.plan?.id,
      creditPackageId: selection.package?.id,
      packageName: selection.displayName,
      amount: selection.amount,
      currency: selection.currency,
      provider: "LEMON",
      method: "LEMON",
      status: "PENDING",
      reportCredits: selection.credits,
      lemonVariantId: selection.variantId,
    },
  });
  const customData = buildLemonCheckoutCustomData({
    userId: input.user.id,
    planId: selection.plan?.id,
    packageId: selection.package?.id,
    packageKey: selection.packageKey,
    credits: selection.credits,
    appPaymentType: selection.appPaymentType,
    paymentId: pendingPayment.id,
  });

  try {
    const checkout = await createLemonCheckout({
      variantId: selection.variantId,
      successUrl,
      email: input.user.email,
      name: input.user.name,
      customData,
    });

    const payment = await prisma.payment.update({
      where: { id: pendingPayment.id },
      data: {
        lemonCheckoutId: checkout.id,
        transactionRef: checkout.id,
      },
    });

    await prisma.adminAuditLog
      .create({
        data: {
          adminUserId: input.user.id,
          action: "LEMON_CHECKOUT_CREATED",
          targetUserId: input.user.id,
          targetType: "Payment",
          targetId: payment.id,
          metadata: {
            lemonCheckoutId: maskLemonId(checkout.id),
            paymentType: selection.appPaymentType,
            planId: selection.plan?.id ?? null,
            packageId: selection.package?.id ?? null,
            credits: selection.credits,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);

    return {
      checkoutId: checkout.id,
      url: checkout.url,
      cancelUrl,
    };
  } catch (error) {
    await prisma.payment
      .update({
        where: { id: pendingPayment.id },
        data: { status: "FAILED" },
      })
      .catch(() => undefined);

    throw error;
  }
}

async function claimLemonEvent(input: {
  event: LemonWebhookEvent;
  rawBody: string;
  headerEventName?: string | null;
}): Promise<LemonEventRecord | null> {
  const prisma = getPrisma();
  const eventName = getLemonEventName(input.event, input.headerEventName);
  const eventId = getLemonEventStorageKey(input);

  try {
    return await prisma.lemonSqueezyEvent.create({
      data: {
        eventId,
        eventName,
        processingStatus: "PROCESSING",
      },
      select: { id: true, processingStatus: true },
    });
  } catch {
    const existing = await prisma.lemonSqueezyEvent.findUnique({
      where: { eventId },
      select: { id: true, processingStatus: true },
    });

    if (!existing || existing.processingStatus === "PROCESSED") {
      return null;
    }

    if (existing.processingStatus === "PROCESSING") {
      return null;
    }

    return prisma.lemonSqueezyEvent.update({
      where: { id: existing.id },
      data: {
        processingStatus: "PROCESSING",
        errorMessage: null,
      },
      select: { id: true, processingStatus: true },
    });
  }
}

async function fulfillOneTimePlanOrder(input: {
  tx: Prisma.TransactionClient;
  userId: string;
  plan: Plan;
  attributes: LemonAttributes;
  orderId: string;
  customerId: string | null;
  variantId: string | null;
  productId: string | null;
  paymentId?: string;
}) {
  const existingPayment = await input.tx.payment.findUnique({
    where: { providerEventId: `lemon_order:${input.orderId}` },
  });

  if (existingPayment?.status === "APPROVED") {
    return null;
  }

  const now = new Date();

  await input.tx.subscription.updateMany({
    where: {
      userId: input.userId,
      status: "ACTIVE",
    },
    data: { status: "INACTIVE" },
  });

  await input.tx.subscription.create({
    data: {
      userId: input.userId,
      planId: input.plan.id,
      status: "ACTIVE",
      provider: "LEMON",
      lemonCustomerId: input.customerId,
      currentPeriodStart: now,
      currentPeriodEnd: getPeriodEndForBillingType(input.plan.billingType, now),
      creditsTotal: input.plan.reportCredits,
      creditsUsed: 0,
      creditsRemaining: input.plan.reportCredits,
    },
  });

  if (input.customerId) {
    await input.tx.user
      .update({
        where: { id: input.userId },
        data: { lemonCustomerId: input.customerId },
      })
      .catch(() => undefined);
  }

  const payment = await markPendingPaymentForEvent(input.tx, {
    paymentId: input.paymentId,
    providerEventId: `lemon_order:${input.orderId}`,
    userId: input.userId,
    planId: input.plan.id,
    packageName: input.plan.name,
    amount: centsToDecimalAmount(input.attributes.total, input.plan.price.toString()),
    currency: readCurrency(input.attributes, input.plan.currency),
    status: "APPROVED",
    credits: input.plan.reportCredits,
    lemonOrderId: input.orderId,
    lemonCustomerId: input.customerId,
    lemonVariantId: input.variantId,
    lemonProductId: input.productId,
  });

  await auditLemonEvent(input.tx, {
    userId: input.userId,
    action: "LEMON_PAYMENT_COMPLETED",
    targetType: "Payment",
    targetId: payment.id,
    metadata: {
      lemonOrderId: maskLemonId(input.orderId),
      planId: input.plan.id,
      creditsAdded: input.plan.reportCredits,
    } as Prisma.InputJsonValue,
  });

  if (input.plan.reportCredits > 0) {
    await auditLemonEvent(input.tx, {
      userId: input.userId,
      action: "LEMON_CREDITS_ADDED",
      targetType: "Subscription",
      targetId: payment.id,
      metadata: {
        planId: input.plan.id,
        creditsAdded: input.plan.reportCredits,
      } as Prisma.InputJsonValue,
    });
  }

  return payment.id;
}

async function fulfillCreditPackageOrder(input: {
  tx: Prisma.TransactionClient;
  userId: string;
  creditPackage: CreditPackage;
  attributes: LemonAttributes;
  orderId: string;
  customerId: string | null;
  variantId: string | null;
  productId: string | null;
  paymentId?: string;
}) {
  const existingPayment = await input.tx.payment.findUnique({
    where: { providerEventId: `lemon_order:${input.orderId}` },
  });

  if (existingPayment?.status === "APPROVED") {
    return null;
  }

  const now = new Date();
  const activeSubscription = await ensureActiveSubscriptionForCredits(
    input.tx,
    input.userId,
    now,
  );

  await input.tx.subscription.update({
    where: { id: activeSubscription.id },
    data: {
      creditsTotal: { increment: input.creditPackage.reportCredits },
      creditsRemaining: { increment: input.creditPackage.reportCredits },
    },
  });

  if (input.customerId) {
    await input.tx.user
      .update({
        where: { id: input.userId },
        data: { lemonCustomerId: input.customerId },
      })
      .catch(() => undefined);
  }

  const payment = await markPendingPaymentForEvent(input.tx, {
    paymentId: input.paymentId,
    providerEventId: `lemon_order:${input.orderId}`,
    userId: input.userId,
    creditPackageId: input.creditPackage.id,
    packageName: input.creditPackage.name,
    amount: centsToDecimalAmount(
      input.attributes.total,
      input.creditPackage.price.toString(),
    ),
    currency: readCurrency(input.attributes, input.creditPackage.currency),
    status: "APPROVED",
    credits: input.creditPackage.reportCredits,
    lemonOrderId: input.orderId,
    lemonCustomerId: input.customerId,
    lemonVariantId: input.variantId,
    lemonProductId: input.productId,
  });

  await auditLemonEvent(input.tx, {
    userId: input.userId,
    action: "LEMON_PAYMENT_COMPLETED",
    targetType: "Payment",
    targetId: payment.id,
    metadata: {
      lemonOrderId: maskLemonId(input.orderId),
      packageId: input.creditPackage.id,
      creditsAdded: input.creditPackage.reportCredits,
    } as Prisma.InputJsonValue,
  });

  await auditLemonEvent(input.tx, {
    userId: input.userId,
    action: "LEMON_CREDITS_ADDED",
    targetType: "Subscription",
    targetId: activeSubscription.id,
    metadata: {
      packageId: input.creditPackage.id,
      creditsAdded: input.creditPackage.reportCredits,
    } as Prisma.InputJsonValue,
  });

  return payment.id;
}

async function handleLemonOrderCreated(event: LemonWebhookEvent) {
  const attributes = readAttributes(event);
  const customData = readCustomData(event);
  const appPaymentType = readCustomString(customData, "appPaymentType") as LemonAppPaymentType;
  const orderId = normalizeLemonId(event.data?.id);

  if (!orderId || appPaymentType === "subscription") {
    return;
  }

  assertLemonStoreMatches(attributes);

  if (attributes.status !== "paid") {
    return;
  }

  const userId = readCustomString(customData, "userId");
  const planId = readCustomString(customData, "planId");
  const packageKey = readCustomString(customData, "packageKey");
  const paymentId = readCustomString(customData, "paymentId") || undefined;
  const customerId = readLemonCustomerId(attributes);
  const variantId = readLemonVariantId(attributes);
  const productId = readLemonProductId(attributes);

  if (!userId) {
    throw new Error("Lemon order metadata is missing the user.");
  }

  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    if (appPaymentType === "one_time_plan") {
      if (!planId) {
        throw new Error("Lemon order metadata is missing the plan.");
      }

      const plan = await tx.plan.findUnique({ where: { id: planId } });

      if (!plan || !plan.isActive) {
        throw new Error("Lemon order plan mapping is unavailable.");
      }

      if (variantId !== getLemonVariantIdForPlanSlug(plan.slug)) {
        throw new Error("Lemon order variant does not match the selected plan.");
      }

      return fulfillOneTimePlanOrder({
        tx,
        userId,
        plan,
        attributes,
        orderId,
        customerId,
        variantId,
        productId,
        paymentId,
      });
    }

    if (appPaymentType === "credit_package") {
      const creditPackage = await tx.creditPackage.findUnique({
        where: { slug: packageKey },
      });

      if (!creditPackage || !creditPackage.isActive) {
        throw new Error("Lemon order credit package mapping is unavailable.");
      }

      if (variantId !== getLemonVariantIdForCreditPackageSlug(creditPackage.slug)) {
        throw new Error("Lemon order variant does not match the selected package.");
      }

      return fulfillCreditPackageOrder({
        tx,
        userId,
        creditPackage,
        attributes,
        orderId,
        customerId,
        variantId,
        productId,
        paymentId,
      });
    }

    return null;
  });
}

async function resolveSubscriptionUserAndPlan(
  tx: Prisma.TransactionClient,
  input: {
    subscriptionId: string;
    customerId: string | null;
    variantId: string | null;
    metadataUserId?: string;
    metadataPlanId?: string;
  },
) {
  const existing = await tx.subscription.findUnique({
    where: { lemonSubscriptionId: input.subscriptionId },
  });
  const user =
    input.metadataUserId
      ? await tx.user.findUnique({
          where: { id: input.metadataUserId },
          select: { id: true, lemonCustomerId: true },
        })
      : input.customerId
        ? await tx.user.findFirst({
            where: { lemonCustomerId: input.customerId },
            select: { id: true, lemonCustomerId: true },
          })
        : null;
  const userId = user?.id ?? existing?.userId;

  if (!userId) {
    throw new Error("Lemon subscription user mapping is missing.");
  }

  let planId = input.metadataPlanId || existing?.planId;

  if (!planId && input.variantId) {
    const slug = getPlanSlugForLemonVariantId(input.variantId);
    const plan = slug ? await tx.plan.findUnique({ where: { slug } }) : null;

    planId = plan?.id;
  }

  if (!planId) {
    throw new Error("Lemon subscription plan mapping is missing.");
  }

  const plan = await tx.plan.findUnique({ where: { id: planId } });

  if (!plan || !plan.isActive) {
    throw new Error("Lemon subscription plan mapping is unavailable.");
  }

  if (input.variantId !== getLemonVariantIdForPlanSlug(plan.slug)) {
    throw new Error("Lemon subscription variant does not match the selected plan.");
  }

  return { existing, userId, plan, user };
}

async function syncLemonSubscriptionRecord(input: {
  event: LemonWebhookEvent;
  grantInitialCredits: boolean;
  markCancelled?: boolean;
}) {
  const attributes = readAttributes(input.event);
  const customData = readCustomData(input.event);
  const lemonSubscriptionId = normalizeLemonId(input.event.data?.id);

  if (!lemonSubscriptionId) {
    throw new Error("Lemon subscription id is missing.");
  }

  assertLemonStoreMatches(attributes);

  const lemonCustomerId = readLemonCustomerId(attributes);
  const lemonVariantId = readLemonVariantId(attributes);
  const lemonProductId = readLemonProductId(attributes);
  const metadataUserId = readCustomString(customData, "userId");
  const metadataPlanId = readCustomString(customData, "planId");
  const paymentId = readCustomString(customData, "paymentId") || undefined;
  const now = new Date();
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const { existing, userId, plan } = await resolveSubscriptionUserAndPlan(tx, {
      subscriptionId: lemonSubscriptionId,
      customerId: lemonCustomerId,
      variantId: lemonVariantId,
      metadataUserId,
      metadataPlanId,
    });
    const lemonStatus = input.markCancelled ? "expired" : String(attributes.status ?? "");
    const status = mapLemonSubscriptionStatus(lemonStatus);
    const currentPeriodStart =
      existing?.currentPeriodStart ?? lemonDateToDate(attributes.created_at) ?? now;
    const currentPeriodEnd =
      lemonDateToDate(attributes.renews_at) ??
      lemonDateToDate(attributes.ends_at) ??
      existing?.currentPeriodEnd ??
      getPeriodEndForBillingType(plan.billingType, now);
    const shouldSeedCredits =
      input.grantInitialCredits &&
      status === "ACTIVE" &&
      (!existing ||
        (existing.creditsTotal === 0 &&
          existing.creditsUsed === 0 &&
          existing.creditsRemaining === 0));

    if (status === "ACTIVE") {
      await tx.subscription.updateMany({
        where: {
          userId,
          status: "ACTIVE",
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        data: { status: "INACTIVE" },
      });
    }

    if (lemonCustomerId) {
      await tx.user
        .update({
          where: { id: userId },
          data: { lemonCustomerId },
        })
        .catch(() => undefined);
    }

    const data = {
      userId,
      planId: plan.id,
      status,
      provider: "LEMON" as const,
      lemonSubscriptionId,
      lemonCustomerId,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd:
        Boolean(attributes.cancelled) || status === "CANCELLED" || status === "PAST_DUE",
      ...(shouldSeedCredits
        ? {
            creditsTotal: plan.reportCredits,
            creditsUsed: 0,
            creditsRemaining: plan.reportCredits,
          }
        : {}),
    };

    const subscription = existing
      ? await tx.subscription.update({
          where: { id: existing.id },
          data,
        })
      : await tx.subscription.create({
          data: {
            ...data,
            creditsTotal: shouldSeedCredits ? plan.reportCredits : 0,
            creditsUsed: 0,
            creditsRemaining: shouldSeedCredits ? plan.reportCredits : 0,
          },
        });

    await auditLemonEvent(tx, {
      userId,
      action: "LEMON_SUBSCRIPTION_CREATED",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: {
        lemonSubscriptionId: maskLemonId(lemonSubscriptionId),
        status,
        planId: plan.id,
        initialCreditsAdded: shouldSeedCredits ? plan.reportCredits : 0,
      } as Prisma.InputJsonValue,
    });

    const payment =
      input.grantInitialCredits && status === "ACTIVE"
        ? await markPendingPaymentForEvent(tx, {
            paymentId,
            providerEventId: `lemon_subscription:${lemonSubscriptionId}:created`,
            userId,
            planId: plan.id,
            packageName: plan.name,
            amount: plan.price.toString(),
            currency: plan.currency,
            status: "APPROVED",
            credits: shouldSeedCredits ? plan.reportCredits : 0,
            lemonSubscriptionId,
            lemonCustomerId,
            lemonVariantId,
            lemonProductId,
          })
        : null;

    return {
      initialCreditsAdded: shouldSeedCredits ? plan.reportCredits : 0,
      paymentId: payment?.id ?? null,
      plan,
      subscription,
    };
  });
}

async function handleLemonSubscriptionPaymentSuccess(event: LemonWebhookEvent) {
  const attributes = readAttributes(event);
  const invoiceId = normalizeLemonId(event.data?.id);
  const lemonSubscriptionId = normalizeLemonId(attributes.subscription_id);

  if (!invoiceId || !lemonSubscriptionId) {
    return null;
  }

  assertLemonStoreMatches(attributes);

  if (attributes.status !== "paid") {
    return null;
  }

  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findUnique({
      where: { providerEventId: `lemon_subscription_invoice:${invoiceId}:success` },
    });

    if (existingPayment?.status === "APPROVED") {
      return null;
    }

    const subscription = await tx.subscription.findUnique({
      where: { lemonSubscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      return null;
    }

    const creditsAdded = shouldGrantLemonInvoiceCredits({
      billingReason:
        typeof attributes.billing_reason === "string"
          ? attributes.billing_reason
          : null,
      paymentStatus:
        typeof attributes.status === "string" ? attributes.status : null,
    })
      ? subscription.plan.reportCredits
      : 0;

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        ...(creditsAdded > 0
          ? {
              creditsTotal: { increment: creditsAdded },
              creditsRemaining: { increment: creditsAdded },
            }
          : {}),
      },
    });

    const payment = await markPendingPaymentForEvent(tx, {
      providerEventId: `lemon_subscription_invoice:${invoiceId}:success`,
      userId: subscription.userId,
      planId: subscription.planId,
      packageName: subscription.plan.name,
      amount: centsToDecimalAmount(attributes.total, subscription.plan.price.toString()),
      currency: readCurrency(attributes, subscription.plan.currency),
      status: "APPROVED",
      credits: creditsAdded,
      lemonSubscriptionId,
      lemonCustomerId: normalizeLemonId(attributes.customer_id) ?? subscription.lemonCustomerId,
    });

    await auditLemonEvent(tx, {
      userId: subscription.userId,
      action: "LEMON_PAYMENT_COMPLETED",
      targetType: "Payment",
      targetId: payment.id,
      metadata: {
        lemonSubscriptionId: maskLemonId(lemonSubscriptionId),
        lemonInvoiceId: maskLemonId(invoiceId),
        billingReason: attributes.billing_reason ?? null,
        creditsAdded,
      } as Prisma.InputJsonValue,
    });

    if (creditsAdded > 0) {
      await auditLemonEvent(tx, {
        userId: subscription.userId,
        action: "LEMON_CREDITS_ADDED",
        targetType: "Subscription",
        targetId: subscription.id,
        metadata: {
          lemonInvoiceId: maskLemonId(invoiceId),
          creditsAdded,
        } as Prisma.InputJsonValue,
      });
    }

    return payment.id;
  });
}

async function handleLemonSubscriptionPaymentFailed(event: LemonWebhookEvent) {
  const attributes = readAttributes(event);
  const invoiceId = normalizeLemonId(event.data?.id);
  const lemonSubscriptionId = normalizeLemonId(attributes.subscription_id);

  if (!invoiceId || !lemonSubscriptionId) {
    return null;
  }

  assertLemonStoreMatches(attributes);

  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({
      where: { lemonSubscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      return null;
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: { status: "PAST_DUE" },
    });

    const payment = await markPendingPaymentForEvent(tx, {
      providerEventId: `lemon_subscription_invoice:${invoiceId}:failed`,
      userId: subscription.userId,
      planId: subscription.planId,
      packageName: subscription.plan.name,
      amount: centsToDecimalAmount(attributes.total, subscription.plan.price.toString()),
      currency: readCurrency(attributes, subscription.plan.currency),
      status: "FAILED",
      credits: 0,
      lemonSubscriptionId,
      lemonCustomerId: normalizeLemonId(attributes.customer_id) ?? subscription.lemonCustomerId,
    });

    await auditLemonEvent(tx, {
      userId: subscription.userId,
      action: "LEMON_PAYMENT_FAILED",
      targetType: "Payment",
      targetId: payment.id,
      metadata: {
        lemonSubscriptionId: maskLemonId(lemonSubscriptionId),
        lemonInvoiceId: maskLemonId(invoiceId),
      } as Prisma.InputJsonValue,
    });

    return payment.id;
  });
}

async function processLemonEvent(event: LemonWebhookEvent, headerEventName?: string | null) {
  const eventName = getLemonEventName(event, headerEventName);

  switch (eventName) {
    case "order_created": {
      const paymentId = await handleLemonOrderCreated(event);

      if (paymentId) {
        await notifyPaymentActivated(paymentId);
      }
      break;
    }
    case "subscription_created": {
      const result = await syncLemonSubscriptionRecord({
        event,
        grantInitialCredits: true,
      });

      if (result.paymentId) {
        await notifyPaymentActivated(result.paymentId);
      }
      break;
    }
    case "subscription_updated": {
      await syncLemonSubscriptionRecord({ event, grantInitialCredits: false });
      break;
    }
    case "subscription_cancelled":
    case "subscription_expired": {
      await syncLemonSubscriptionRecord({
        event,
        grantInitialCredits: false,
        markCancelled: true,
      });
      break;
    }
    case "subscription_payment_success": {
      const paymentId = await handleLemonSubscriptionPaymentSuccess(event);

      if (paymentId) {
        await notifyPaymentActivated(paymentId);
      }
      break;
    }
    case "subscription_payment_failed": {
      const paymentId = await handleLemonSubscriptionPaymentFailed(event);

      if (paymentId) {
        await notifyPaymentFailed(paymentId);
      }
      break;
    }
    default:
      break;
  }
}

export async function handleLemonWebhookEvent(input: {
  event: LemonWebhookEvent;
  rawBody: string;
  headerEventName?: string | null;
}) {
  const prisma = getPrisma();
  const eventRecord = await claimLemonEvent(input);

  if (!eventRecord) {
    return { duplicate: true, processed: false };
  }

  try {
    await processLemonEvent(input.event, input.headerEventName);
    await prisma.lemonSqueezyEvent.update({
      where: { id: eventRecord.id },
      data: {
        processingStatus: "PROCESSED",
        processedAt: new Date(),
        errorMessage: null,
      },
    });

    return { duplicate: false, processed: true };
  } catch (error) {
    const message = safeLemonErrorMessage(error);

    await prisma.lemonSqueezyEvent.update({
      where: { id: eventRecord.id },
      data: {
        processingStatus: "FAILED",
        errorMessage: message,
      },
    });

    const customData = readCustomData(input.event);
    const userId = readCustomString(customData, "userId");

    if (userId) {
      await prisma.adminAuditLog
        .create({
          data: {
            adminUserId: userId,
            action: "LEMON_WEBHOOK_FAILED",
            targetUserId: userId,
            targetType: "LemonSqueezyEvent",
            targetId: getLemonEventStorageKey(input),
            reason: message,
            metadata: {
              eventName: getLemonEventName(input.event, input.headerEventName),
            } as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);
    }

    throw error;
  }
}

export type LemonCheckoutInput = LemonCheckoutRequest;
export type LemonSubscriptionWithPlan = Subscription & { plan: Plan };
