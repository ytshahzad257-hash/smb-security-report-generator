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
import { getPrisma } from "./prisma.ts";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  createStripePortalSession,
  getStripeConfigStatus,
  getStripeUnavailableMessage,
  maskStripeId,
  normalizeStripeId,
  retrieveStripeSubscription,
  StripeConfigError,
  stripeTimestampToDate,
  type StripeCheckoutMode,
  type StripeCheckoutSession,
  type StripeEventPayload,
  type StripeInvoice,
  type StripeSubscription,
} from "./stripe.ts";
import { notifyPaymentActivated, notifyPaymentFailed } from "./email/notifications.ts";

const FREE_PLAN_SLUG = "free-demo";
const CHECKOUT_SUCCESS_PATH = "/dashboard/billing?stripe=success";
const CHECKOUT_CANCEL_PATH = "/dashboard/billing?stripe=cancelled";

type CheckoutUser = {
  id: string;
  email: string;
  name: string | null;
};

type CheckoutSelection =
  | {
      kind: "plan";
      appPaymentType: "subscription" | "credit_package";
      mode: StripeCheckoutMode;
      plan: Plan;
      package: null;
      priceId: string;
      amount: string;
      currency: string;
      credits: number;
      displayName: string;
    }
  | {
      kind: "credit_package";
      appPaymentType: "credit_package";
      mode: "payment";
      plan: null;
      package: CreditPackage;
      priceId: string;
      amount: string;
      currency: string;
      credits: number;
      displayName: string;
    };

type StripeEventRecord = {
  id: string;
  processingStatus: string;
};

export type StripeCheckoutRequest = {
  planId?: string;
  packageId?: string;
  successUrl?: string;
  cancelUrl?: string;
};

function getPeriodEndForBillingType(billingType: BillingType, start: Date) {
  if (billingType === "MONTHLY" || billingType === "ADDON" || billingType === "ONE_TIME") {
    return addMonths(start, 1);
  }

  return addYears(start, 1);
}

export function resolvePlanStripeMode(plan: Pick<Plan, "stripeMode" | "billingType">) {
  const configuredMode = plan.stripeMode?.toLowerCase();

  if (configuredMode === "subscription" || configuredMode === "payment") {
    return configuredMode;
  }

  return plan.billingType === "MONTHLY" ? "subscription" : "payment";
}

export function buildStripeCheckoutMetadata(input: {
  userId: string;
  planId?: string | null;
  packageId?: string | null;
  credits: number;
  appPaymentType: "subscription" | "credit_package";
}) {
  return {
    userId: input.userId,
    planId: input.planId ?? "",
    packageId: input.packageId ?? "",
    credits: String(input.credits),
    appPaymentType: input.appPaymentType,
  };
}

export function mapStripeSubscriptionStatus(
  stripeStatus: string | null | undefined,
): SubscriptionStatus {
  if (stripeStatus === "active" || stripeStatus === "trialing") {
    return "ACTIVE";
  }

  if (
    stripeStatus === "past_due" ||
    stripeStatus === "unpaid" ||
    stripeStatus === "incomplete"
  ) {
    return "PAST_DUE";
  }

  if (stripeStatus === "canceled") {
    return "CANCELLED";
  }

  return "INACTIVE";
}

export function shouldGrantInvoicePeriodCredits(
  subscription: Pick<Subscription, "currentPeriodStart" | "currentPeriodEnd">,
  nextPeriod: { start: Date | null; end: Date | null },
) {
  if (!nextPeriod.start || !nextPeriod.end) {
    return false;
  }

  return (
    subscription.currentPeriodStart.getTime() !== nextPeriod.start.getTime() ||
    subscription.currentPeriodEnd.getTime() !== nextPeriod.end.getTime()
  );
}

export function centsToDecimalAmount(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toFixed(2);
}

export function safeStripeErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Stripe event processing failed.";

  return message.replace(/(sk_(test|live)_[A-Za-z0-9_]+)/g, "[redacted]").slice(0, 1000);
}

export async function getActiveCreditPackages() {
  const prisma = getPrisma();

  return prisma.creditPackage.findMany({
    where: { isActive: true },
    orderBy: [{ price: "asc" }, { name: "asc" }],
  });
}

export function getStripeBillingStatus() {
  return {
    ...getStripeConfigStatus(),
    unavailableMessage: getStripeUnavailableMessage(),
  };
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

function ensureStripeCheckoutConfigured() {
  if (!getStripeConfigStatus().checkoutConfigured) {
    throw new StripeConfigError(getStripeUnavailableMessage());
  }
}

async function resolveCheckoutSelection(input: StripeCheckoutRequest) {
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

    const mode = resolvePlanStripeMode(plan);

    if (!plan.isStripeEnabled || !plan.stripePriceId) {
      throw new Error("Selected plan is not available for card payment.");
    }

    if (plan.reportCredits < 0) {
      throw new Error("Selected plan has invalid credits.");
    }

    return {
      kind: "plan",
      appPaymentType: mode === "subscription" ? "subscription" : "credit_package",
      mode,
      plan,
      package: null,
      priceId: plan.stripePriceId,
      amount: plan.price.toString(),
      currency: plan.currency,
      credits: plan.reportCredits,
      displayName: plan.name,
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

  if (!creditPackage.isStripeEnabled || !creditPackage.stripePriceId) {
    throw new Error("Selected credit package is not available for card payment.");
  }

  if (creditPackage.reportCredits <= 0) {
    throw new Error("Selected credit package has invalid credits.");
  }

  return {
    kind: "credit_package",
    appPaymentType: "credit_package",
    mode: "payment",
    plan: null,
    package: creditPackage,
    priceId: creditPackage.stripePriceId,
    amount: creditPackage.price.toString(),
    currency: creditPackage.currency,
    credits: creditPackage.reportCredits,
    displayName: creditPackage.name,
  } satisfies CheckoutSelection;
}

async function getOrCreateStripeCustomer(user: CheckoutUser) {
  const prisma = getPrisma();
  const savedUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      stripeCustomerId: true,
    },
  });

  if (!savedUser) {
    throw new Error("User not found.");
  }

  if (savedUser.stripeCustomerId) {
    return savedUser.stripeCustomerId;
  }

  const customer = await createStripeCustomer({
    email: savedUser.email,
    name: savedUser.name,
    userId: savedUser.id,
  });

  try {
    await prisma.user.update({
      where: { id: savedUser.id },
      data: { stripeCustomerId: customer.id },
    });
  } catch {
    const refreshed = await prisma.user.findUnique({
      where: { id: savedUser.id },
      select: { stripeCustomerId: true },
    });

    if (refreshed?.stripeCustomerId) {
      return refreshed.stripeCustomerId;
    }

    throw new Error("Stripe customer could not be saved.");
  }

  return customer.id;
}

export async function createStripeCheckoutForUser(input: {
  user: CheckoutUser;
  checkout: StripeCheckoutRequest;
  requestUrl: string;
}) {
  ensureStripeCheckoutConfigured();

  const selection = await resolveCheckoutSelection(input.checkout);
  const customerId = await getOrCreateStripeCustomer(input.user);
  const successUrl = resolveCheckoutRedirectUrl(
    input.checkout.successUrl,
    process.env.STRIPE_SUCCESS_URL,
    CHECKOUT_SUCCESS_PATH,
    input.requestUrl,
  );
  const cancelUrl = resolveCheckoutRedirectUrl(
    input.checkout.cancelUrl,
    process.env.STRIPE_CANCEL_URL,
    CHECKOUT_CANCEL_PATH,
    input.requestUrl,
  );
  const metadata = buildStripeCheckoutMetadata({
    userId: input.user.id,
    planId: selection.plan?.id,
    packageId: selection.package?.id,
    credits: selection.credits,
    appPaymentType: selection.appPaymentType,
  });
  const session = await createStripeCheckoutSession({
    customerId,
    priceId: selection.priceId,
    mode: selection.mode,
    successUrl,
    cancelUrl,
    metadata,
  });

  if (!session.url) {
    throw new Error("Checkout session creation failed.");
  }

  const prisma = getPrisma();
  const payment = await prisma.payment.upsert({
    where: { stripeCheckoutSessionId: session.id },
    update: {
      status: "PENDING",
      provider: "STRIPE",
      method: "STRIPE",
      stripePaymentIntentId: normalizeStripeId(session.payment_intent),
      stripeSubscriptionId: normalizeStripeId(session.subscription),
    },
    create: {
      userId: input.user.id,
      planId: selection.plan?.id,
      creditPackageId: selection.package?.id,
      packageName: selection.displayName,
      amount: selection.amount,
      currency: selection.currency,
      provider: "STRIPE",
      method: "STRIPE",
      status: "PENDING",
      reportCredits: selection.credits,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: normalizeStripeId(session.payment_intent),
      stripeSubscriptionId: normalizeStripeId(session.subscription),
    },
  });

  await prisma.adminAuditLog
    .create({
      data: {
        adminUserId: input.user.id,
        action: "STRIPE_CHECKOUT_CREATED",
        targetUserId: input.user.id,
        targetType: "Payment",
        targetId: payment.id,
        metadata: {
          checkoutSessionId: maskStripeId(session.id),
          paymentType: selection.appPaymentType,
          planId: selection.plan?.id ?? null,
          packageId: selection.package?.id ?? null,
          credits: selection.credits,
        } as Prisma.InputJsonValue,
      },
    })
    .catch(() => undefined);

  return {
    sessionId: session.id,
    url: session.url,
  };
}

export async function createStripePortalForUser(input: {
  userId: string;
  requestUrl: string;
}) {
  ensureStripeCheckoutConfigured();

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) {
    throw new Error("No Stripe customer is linked to this account.");
  }

  const portal = await createStripePortalSession({
    customerId: user.stripeCustomerId,
    returnUrl: `${resolveBaseUrl(input.requestUrl)}/dashboard/billing`,
  });

  return { url: portal.url };
}

async function claimStripeEvent(event: StripeEventPayload): Promise<StripeEventRecord | null> {
  const prisma = getPrisma();

  try {
    return await prisma.stripeEvent.create({
      data: {
        stripeEventId: event.id,
        eventType: event.type,
        processingStatus: "PROCESSING",
      },
      select: { id: true, processingStatus: true },
    });
  } catch {
    const existing = await prisma.stripeEvent.findUnique({
      where: { stripeEventId: event.id },
      select: { id: true, processingStatus: true },
    });

    if (!existing || existing.processingStatus === "PROCESSED") {
      return null;
    }

    if (existing.processingStatus === "PROCESSING") {
      return null;
    }

    return prisma.stripeEvent.update({
      where: { id: existing.id },
      data: {
        processingStatus: "PROCESSING",
        errorMessage: null,
      },
      select: { id: true, processingStatus: true },
    });
  }
}

function readMetadata(object: { metadata?: Record<string, string> | null }) {
  return object.metadata ?? {};
}

function readCustomerId(value: unknown) {
  return normalizeStripeId(value);
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

async function auditStripeEvent(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    action: string;
    targetType?: string;
    targetId?: string;
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
        metadata: input.metadata,
      },
    })
    .catch(() => undefined);
}

async function markPaymentApprovedForCheckout(
  tx: Prisma.TransactionClient,
  input: {
    session: StripeCheckoutSession;
    userId: string;
    planId?: string | null;
    creditPackageId?: string | null;
    packageName: string;
    amount: string;
    currency: string;
    credits: number;
    stripeSubscriptionId?: string | null;
  },
) {
  return tx.payment.upsert({
    where: { stripeCheckoutSessionId: input.session.id },
    update: {
      userId: input.userId,
      planId: input.planId ?? null,
      creditPackageId: input.creditPackageId ?? null,
      packageName: input.packageName,
      amount: input.amount,
      currency: input.currency,
      provider: "STRIPE",
      method: "STRIPE",
      status: "APPROVED",
      reportCredits: input.credits,
      stripePaymentIntentId: normalizeStripeId(input.session.payment_intent),
      stripeSubscriptionId: input.stripeSubscriptionId ?? normalizeStripeId(input.session.subscription),
      transactionRef: input.session.id,
    },
    create: {
      userId: input.userId,
      planId: input.planId ?? null,
      creditPackageId: input.creditPackageId ?? null,
      packageName: input.packageName,
      amount: input.amount,
      currency: input.currency,
      provider: "STRIPE",
      method: "STRIPE",
      status: "APPROVED",
      reportCredits: input.credits,
      stripeCheckoutSessionId: input.session.id,
      stripePaymentIntentId: normalizeStripeId(input.session.payment_intent),
      stripeSubscriptionId: input.stripeSubscriptionId ?? normalizeStripeId(input.session.subscription),
      transactionRef: input.session.id,
    },
  });
}

async function fulfillCreditPackageCheckout(session: StripeCheckoutSession) {
  const metadata = readMetadata(session);
  const userId = metadata.userId;
  const planId = metadata.planId || null;
  const packageId = metadata.packageId || null;

  if (!userId || (!planId && !packageId)) {
    throw new Error("Stripe checkout metadata is missing a purchase target.");
  }

  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const approvedPayment = await tx.payment.findUnique({
      where: { stripeCheckoutSessionId: session.id },
      select: { id: true, status: true },
    });

    if (approvedPayment?.status === "APPROVED") {
      return null;
    }

    const now = new Date();
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, stripeCustomerId: true },
    });

    if (!user) {
      throw new Error("Stripe checkout user was not found.");
    }

    if (planId) {
      const plan = await tx.plan.findUnique({ where: { id: planId } });

      if (!plan || !plan.isActive || resolvePlanStripeMode(plan) !== "payment") {
        throw new Error("Stripe checkout plan mapping is unavailable.");
      }

      if (plan.reportCredits < 0) {
        throw new Error("Stripe checkout plan credits are invalid.");
      }

      await tx.subscription.updateMany({
        where: { userId, status: "ACTIVE" },
        data: { status: "INACTIVE" },
      });

      await tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: "ACTIVE",
          provider: "STRIPE",
          stripeCustomerId: readCustomerId(session.customer) ?? user.stripeCustomerId,
          currentPeriodStart: now,
          currentPeriodEnd: getPeriodEndForBillingType(plan.billingType, now),
          creditsTotal: plan.reportCredits,
          creditsUsed: 0,
          creditsRemaining: plan.reportCredits,
        },
      });

      const payment = await markPaymentApprovedForCheckout(tx, {
        session,
        userId,
        planId: plan.id,
        packageName: plan.name,
        amount: plan.price.toString(),
        currency: plan.currency,
        credits: plan.reportCredits,
      });

      await auditStripeEvent(tx, {
        userId,
        action: "STRIPE_PAYMENT_COMPLETED",
        targetType: "Payment",
        targetId: payment.id,
        metadata: {
          checkoutSessionId: maskStripeId(session.id),
          planId: plan.id,
          creditsAdded: plan.reportCredits,
        } as Prisma.InputJsonValue,
      });

      return payment.id;
    }

    const creditPackage = await tx.creditPackage.findUnique({
      where: { id: packageId as string },
    });

    if (!creditPackage || !creditPackage.isActive || creditPackage.reportCredits <= 0) {
      throw new Error("Stripe checkout credit package mapping is unavailable.");
    }

    const activeSubscription = await ensureActiveSubscriptionForCredits(tx, userId, now);

    await tx.subscription.update({
      where: { id: activeSubscription.id },
      data: {
        creditsTotal: { increment: creditPackage.reportCredits },
        creditsRemaining: { increment: creditPackage.reportCredits },
      },
    });

    const payment = await markPaymentApprovedForCheckout(tx, {
      session,
      userId,
      creditPackageId: creditPackage.id,
      packageName: creditPackage.name,
      amount: creditPackage.price.toString(),
      currency: creditPackage.currency,
      credits: creditPackage.reportCredits,
    });

    await auditStripeEvent(tx, {
      userId,
      action: "STRIPE_PAYMENT_COMPLETED",
      targetType: "Payment",
      targetId: payment.id,
      metadata: {
        checkoutSessionId: maskStripeId(session.id),
        packageId: creditPackage.id,
        creditsAdded: creditPackage.reportCredits,
      } as Prisma.InputJsonValue,
    });

    return payment.id;
  });
}

async function syncStripeSubscriptionRecord(input: {
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  userId?: string | null;
  planId?: string | null;
  stripeStatus?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
  grantInitialCredits: boolean;
}) {
  const prisma = getPrisma();
  const now = new Date();
  const status = mapStripeSubscriptionStatus(input.stripeStatus);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({
      where: { stripeSubscriptionId: input.stripeSubscriptionId },
      include: { plan: true },
    });
    const user =
      input.userId
        ? await tx.user.findUnique({
            where: { id: input.userId },
            select: { id: true, stripeCustomerId: true },
          })
        : input.stripeCustomerId
          ? await tx.user.findFirst({
              where: { stripeCustomerId: input.stripeCustomerId },
              select: { id: true, stripeCustomerId: true },
            })
          : null;
    const userId = user?.id ?? existing?.userId;

    if (!userId) {
      throw new Error("Stripe subscription user mapping is missing.");
    }

    const planId = input.planId || existing?.planId;

    if (!planId) {
      throw new Error("Stripe subscription plan mapping is missing.");
    }

    const plan = await tx.plan.findUnique({ where: { id: planId } });

    if (!plan || !plan.isActive) {
      throw new Error("Stripe subscription plan mapping is unavailable.");
    }

    const currentPeriodStart =
      input.currentPeriodStart ?? existing?.currentPeriodStart ?? now;
    const currentPeriodEnd =
      input.currentPeriodEnd ??
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

    const data = {
      userId,
      planId: plan.id,
      status,
      provider: "STRIPE" as const,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeCustomerId: input.stripeCustomerId ?? user?.stripeCustomerId ?? null,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: Boolean(input.cancelAtPeriodEnd),
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

    await auditStripeEvent(tx, {
      userId,
      action: "STRIPE_SUBSCRIPTION_UPDATED",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: {
        stripeSubscriptionId: maskStripeId(input.stripeSubscriptionId),
        status,
        planId: plan.id,
        initialCreditsAdded: shouldSeedCredits ? plan.reportCredits : 0,
      } as Prisma.InputJsonValue,
    });

    return { subscription, plan, initialCreditsAdded: shouldSeedCredits ? plan.reportCredits : 0 };
  });
}

function subscriptionFromCheckout(
  session: StripeCheckoutSession,
  retrievedSubscription: StripeSubscription | null,
) {
  const metadata = readMetadata(session);

  return {
    stripeSubscriptionId:
      normalizeStripeId(session.subscription) ?? retrievedSubscription?.id ?? null,
    stripeCustomerId:
      readCustomerId(session.customer) ??
      readCustomerId(retrievedSubscription?.customer) ??
      null,
    userId: metadata.userId || retrievedSubscription?.metadata?.userId || null,
    planId: metadata.planId || retrievedSubscription?.metadata?.planId || null,
    stripeStatus:
      retrievedSubscription?.status ??
      (session.payment_status === "paid" ? "active" : null),
    currentPeriodStart: stripeTimestampToDate(
      retrievedSubscription?.current_period_start,
    ),
    currentPeriodEnd: stripeTimestampToDate(
      retrievedSubscription?.current_period_end,
    ),
    cancelAtPeriodEnd: retrievedSubscription?.cancel_at_period_end ?? false,
  };
}

async function fulfillSubscriptionCheckout(session: StripeCheckoutSession) {
  const subscriptionId = normalizeStripeId(session.subscription);

  if (!subscriptionId) {
    throw new Error("Stripe checkout subscription id is missing.");
  }

  const retrievedSubscription = await retrieveStripeSubscription(subscriptionId).catch(
    () => null,
  );
  const syncInput = subscriptionFromCheckout(session, retrievedSubscription);

  if (!syncInput.stripeSubscriptionId) {
    throw new Error("Stripe subscription id is missing.");
  }

  const synced = await syncStripeSubscriptionRecord({
    ...syncInput,
    stripeSubscriptionId: syncInput.stripeSubscriptionId,
    grantInitialCredits: true,
  });

  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const payment = await markPaymentApprovedForCheckout(tx, {
      session,
      userId: synced.subscription.userId,
      planId: synced.subscription.planId,
      packageName: synced.plan.name,
      amount: synced.plan.price.toString(),
      currency: synced.plan.currency,
      credits: synced.initialCreditsAdded,
      stripeSubscriptionId: synced.subscription.stripeSubscriptionId,
    });

    await auditStripeEvent(tx, {
      userId: synced.subscription.userId,
      action: "STRIPE_PAYMENT_COMPLETED",
      targetType: "Payment",
      targetId: payment.id,
      metadata: {
        checkoutSessionId: maskStripeId(session.id),
        stripeSubscriptionId: maskStripeId(subscriptionId),
        creditsAdded: synced.initialCreditsAdded,
      } as Prisma.InputJsonValue,
    });

    return payment.id;
  });
}

function readSubscriptionMetadata(subscription: StripeSubscription) {
  return subscription.metadata ?? {};
}

async function handleStripeSubscriptionChanged(
  subscription: StripeSubscription,
  deleted = false,
) {
  const metadata = readSubscriptionMetadata(subscription);
  const stripeSubscriptionId = subscription.id;
  const stripeCustomerId = readCustomerId(subscription.customer);
  const status = deleted ? "canceled" : subscription.status;

  await syncStripeSubscriptionRecord({
    stripeSubscriptionId,
    stripeCustomerId,
    userId: metadata.userId || null,
    planId: metadata.planId || null,
    stripeStatus: status,
    currentPeriodStart: stripeTimestampToDate(subscription.current_period_start),
    currentPeriodEnd: stripeTimestampToDate(subscription.current_period_end),
    cancelAtPeriodEnd: deleted ? false : subscription.cancel_at_period_end,
    grantInitialCredits: !deleted,
  });
}

function getInvoicePeriod(invoice: StripeInvoice) {
  const period = invoice.lines?.data?.[0]?.period;

  return {
    start: stripeTimestampToDate(period?.start),
    end: stripeTimestampToDate(period?.end),
  };
}

function getInvoiceMetadata(
  invoice: StripeInvoice,
  retrievedSubscription: StripeSubscription | null,
) {
  return {
    ...(retrievedSubscription?.metadata ?? {}),
    ...(invoice.subscription_details?.metadata ?? {}),
    ...(invoice.metadata ?? {}),
  };
}

async function handleInvoicePaymentSucceeded(invoice: StripeInvoice) {
  const stripeInvoiceId = invoice.id;
  const stripeSubscriptionId = normalizeStripeId(invoice.subscription);

  if (!stripeSubscriptionId) {
    return null;
  }

  const retrievedSubscription = await retrieveStripeSubscription(stripeSubscriptionId).catch(
    () => null,
  );
  const metadata = getInvoiceMetadata(invoice, retrievedSubscription);
  const stripeCustomerId =
    readCustomerId(invoice.customer) ?? readCustomerId(retrievedSubscription?.customer);

  if (retrievedSubscription) {
    await syncStripeSubscriptionRecord({
      stripeSubscriptionId,
      stripeCustomerId,
      userId: metadata.userId || null,
      planId: metadata.planId || null,
      stripeStatus: retrievedSubscription.status ?? "active",
      currentPeriodStart: stripeTimestampToDate(
        retrievedSubscription.current_period_start,
      ),
      currentPeriodEnd: stripeTimestampToDate(retrievedSubscription.current_period_end),
      cancelAtPeriodEnd: retrievedSubscription.cancel_at_period_end,
      grantInitialCredits: false,
    });
  }

  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findUnique({
      where: { stripeInvoiceId },
    });

    if (existingPayment) {
      return null;
    }

    const subscription = await tx.subscription.findUnique({
      where: { stripeSubscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new Error("Stripe invoice subscription mapping is missing.");
    }

    const period = getInvoicePeriod(invoice);
    const shouldGrantCredits =
      invoice.billing_reason !== "subscription_create" &&
      shouldGrantInvoicePeriodCredits(subscription, period);
    const creditsAdded = shouldGrantCredits ? subscription.plan.reportCredits : 0;

    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        ...(period.start ? { currentPeriodStart: period.start } : {}),
        ...(period.end ? { currentPeriodEnd: period.end } : {}),
        ...(shouldGrantCredits
          ? {
              creditsTotal: { increment: creditsAdded },
              creditsRemaining: { increment: creditsAdded },
            }
          : {}),
      },
    });

    const payment = await tx.payment.create({
      data: {
        userId: subscription.userId,
        planId: subscription.planId,
        packageName: subscription.plan.name,
        amount: centsToDecimalAmount(invoice.amount_paid),
        currency: invoice.currency?.toUpperCase() ?? subscription.plan.currency,
        provider: "STRIPE",
        method: "STRIPE",
        status: "APPROVED",
        reportCredits: creditsAdded,
        stripeInvoiceId,
        stripePaymentIntentId: normalizeStripeId(invoice.payment_intent),
        stripeSubscriptionId,
        transactionRef: stripeInvoiceId,
      },
    });

    await auditStripeEvent(tx, {
      userId: subscription.userId,
      action: "STRIPE_PAYMENT_COMPLETED",
      targetType: "Payment",
      targetId: payment.id,
      metadata: {
        stripeInvoiceId: maskStripeId(stripeInvoiceId),
        stripeSubscriptionId: maskStripeId(stripeSubscriptionId),
        creditsAdded,
      } as Prisma.InputJsonValue,
    });

    return payment.id;
  });
}

async function handleInvoicePaymentFailed(invoice: StripeInvoice) {
  const stripeInvoiceId = invoice.id;
  const stripeSubscriptionId = normalizeStripeId(invoice.subscription);

  if (!stripeSubscriptionId) {
    return null;
  }

  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const existingPayment = await tx.payment.findUnique({
      where: { stripeInvoiceId },
    });

    if (existingPayment) {
      return null;
    }

    const subscription = await tx.subscription.findUnique({
      where: { stripeSubscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      return null;
    }

    await tx.subscription.update({
      where: { id: subscription.id },
      data: { status: "PAST_DUE" },
    });

    const payment = await tx.payment.create({
      data: {
        userId: subscription.userId,
        planId: subscription.planId,
        packageName: subscription.plan.name,
        amount: centsToDecimalAmount(invoice.amount_due),
        currency: invoice.currency?.toUpperCase() ?? subscription.plan.currency,
        provider: "STRIPE",
        method: "STRIPE",
        status: "FAILED" satisfies PaymentStatus,
        reportCredits: 0,
        stripeInvoiceId,
        stripePaymentIntentId: normalizeStripeId(invoice.payment_intent),
        stripeSubscriptionId,
        transactionRef: stripeInvoiceId,
      },
    });

    await auditStripeEvent(tx, {
      userId: subscription.userId,
      action: "STRIPE_PAYMENT_FAILED",
      targetType: "Payment",
      targetId: payment.id,
      metadata: {
        stripeInvoiceId: maskStripeId(stripeInvoiceId),
        stripeSubscriptionId: maskStripeId(stripeSubscriptionId),
      } as Prisma.InputJsonValue,
    });

    return payment.id;
  });
}

async function processStripeEvent(event: StripeEventPayload) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as StripeCheckoutSession;
      const metadata = readMetadata(session);

      if (session.mode === "subscription" || metadata.appPaymentType === "subscription") {
        const paymentId = await fulfillSubscriptionCheckout(session);

        if (paymentId) {
          await notifyPaymentActivated(paymentId);
        }
      } else if (session.mode === "payment" && metadata.appPaymentType === "credit_package") {
        const paymentId = await fulfillCreditPackageCheckout(session);

        if (paymentId) {
          await notifyPaymentActivated(paymentId);
        }
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await handleStripeSubscriptionChanged(event.data.object as StripeSubscription);
      break;
    }
    case "customer.subscription.deleted": {
      await handleStripeSubscriptionChanged(event.data.object as StripeSubscription, true);
      break;
    }
    case "invoice.payment_succeeded": {
      const paymentId = await handleInvoicePaymentSucceeded(event.data.object as StripeInvoice);

      if (paymentId) {
        await notifyPaymentActivated(paymentId);
      }
      break;
    }
    case "invoice.payment_failed": {
      const paymentId = await handleInvoicePaymentFailed(event.data.object as StripeInvoice);

      if (paymentId) {
        await notifyPaymentFailed(paymentId);
      }
      break;
    }
    default:
      break;
  }
}

export async function handleStripeWebhookEvent(event: StripeEventPayload) {
  const prisma = getPrisma();
  const eventRecord = await claimStripeEvent(event);

  if (!eventRecord) {
    return { duplicate: true, processed: false };
  }

  try {
    await processStripeEvent(event);
    await prisma.stripeEvent.update({
      where: { id: eventRecord.id },
      data: {
        processingStatus: "PROCESSED",
        processedAt: new Date(),
        errorMessage: null,
      },
    });

    return { duplicate: false, processed: true };
  } catch (error) {
    const message = safeStripeErrorMessage(error);

    await prisma.stripeEvent.update({
      where: { id: eventRecord.id },
      data: {
        processingStatus: "FAILED",
        errorMessage: message,
      },
    });

    const object = event.data.object as
      | { metadata?: Record<string, string> | null; customer?: unknown }
      | undefined;
    const userId = object?.metadata?.userId;

    if (userId) {
      await prisma.adminAuditLog
        .create({
          data: {
            adminUserId: userId,
            action: "STRIPE_WEBHOOK_FAILED",
            targetUserId: userId,
            targetType: "StripeEvent",
            targetId: event.id,
            reason: message,
            metadata: {
              eventType: event.type,
            } as Prisma.InputJsonValue,
          },
        })
        .catch(() => undefined);
    }

    throw error;
  }
}
