import { addYears } from "@/lib/date";
import {
  canUseProfessionalScanForPlan,
  canDownloadPdfForSubscription,
  createCreditState,
  deductCreditBalance,
  hasReportCreditFromCredits,
} from "@/lib/billing-rules";
import {
  canCreateShareLink as canCreateShareLinkForUser,
  canUseClientManagement as canUseClientManagementForUser,
  canUseWhiteLabel as canUseWhiteLabelForUser,
} from "@/lib/billing/planEntitlements";
import { getPrisma } from "@/lib/prisma";

const FREE_PLAN_SLUG = "free-demo";

type SubscriptionWithPlan = Awaited<ReturnType<typeof getUserSubscription>>;

export async function getActivePlans() {
  const prisma = getPrisma();

  return prisma.plan.findMany({
    where: { isActive: true },
    orderBy: [
      { price: "asc" },
      { name: "asc" },
    ],
  });
}

export async function getUserSubscription(userId: string) {
  const prisma = getPrisma();

  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      plan: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (subscription) {
    return subscription;
  }

  return createFreeSubscriptionForUser(userId);
}

export async function getUserCredits(userId: string) {
  const subscription = await getUserSubscription(userId);

  return {
    creditsTotal: subscription.creditsTotal,
    creditsUsed: subscription.creditsUsed,
    creditsRemaining: subscription.creditsRemaining,
  };
}

export async function hasReportCredit(userId: string) {
  const credits = await getUserCredits(userId);

  return hasReportCreditFromCredits(credits);
}

export async function deductReportCredit(userId: string, reportId?: string) {
  void reportId;

  const subscription = await getUserSubscription(userId);

  if (!hasReportCreditFromCredits(subscription)) {
    return { success: false, creditsRemaining: 0 };
  }

  const prisma = getPrisma();
  const result = await prisma.subscription.updateMany({
    where: {
      id: subscription.id,
      userId,
      status: "ACTIVE",
      creditsRemaining: { gt: 0 },
    },
    data: {
      creditsUsed: { increment: 1 },
      creditsRemaining: { decrement: 1 },
    },
  });

  if (result.count === 0) {
    const refreshed = await getUserSubscription(userId);

    return {
      success: false,
      creditsRemaining: Math.max(refreshed.creditsRemaining, 0),
    };
  }

  return {
    success: true,
    creditsRemaining: deductCreditBalance(subscription).creditsRemaining,
  };
}

export async function canUseWhiteLabel(userId: string) {
  return canUseWhiteLabelForUser(userId);
}

export async function canDownloadPdf(userId: string) {
  const subscription = await getUserSubscription(userId);

  return canDownloadPdfForSubscription(subscription);
}

export async function canManageClients(userId: string) {
  return canUseClientManagementForUser(userId);
}

export async function canUseReportSharing(userId: string) {
  return canCreateShareLinkForUser(userId);
}

export async function canUseProfessionalScan(userId: string) {
  const subscription = await getUserSubscription(userId);

  return canUseProfessionalScanForPlan(subscription.plan);
}

export async function createFreeSubscriptionForUser(userId: string) {
  const prisma = getPrisma();
  const existing = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      plan: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (existing) {
    return existing;
  }

  const freePlan = await prisma.plan.findUnique({
    where: {
      slug: FREE_PLAN_SLUG,
      isActive: true,
    },
  });

  if (!freePlan) {
    throw new Error("Free Demo plan is not seeded.");
  }

  const now = new Date();
  const credits = createCreditState(freePlan.reportCredits);

  return prisma.subscription.create({
    data: {
      userId,
      planId: freePlan.id,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: addYears(now, 1),
      creditsTotal: credits.creditsTotal,
      creditsUsed: credits.creditsUsed,
      creditsRemaining: credits.creditsRemaining,
    },
    include: {
      plan: true,
    },
  });
}

export type UserSubscription = NonNullable<SubscriptionWithPlan>;
