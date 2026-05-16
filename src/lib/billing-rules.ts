type CreditState = {
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
};

type AccessPlan = {
  billingType: string;
  slug?: string;
  reportCredits: number;
  whiteLabelEnabled: boolean;
};

type AccessSubscription = {
  creditsRemaining: number;
  plan: AccessPlan;
};

export function createCreditState(reportCredits: number): CreditState {
  return {
    creditsTotal: reportCredits,
    creditsUsed: 0,
    creditsRemaining: reportCredits,
  };
}

export function hasReportCreditFromCredits(credits: Pick<CreditState, "creditsRemaining">) {
  return credits.creditsRemaining > 0;
}

export function deductCreditBalance(credits: CreditState): CreditState {
  if (credits.creditsRemaining <= 0) {
    return {
      ...credits,
      creditsRemaining: 0,
    };
  }

  return {
    ...credits,
    creditsUsed: credits.creditsUsed + 1,
    creditsRemaining: credits.creditsRemaining - 1,
  };
}

export function canUseWhiteLabelForPlan(plan: Pick<AccessPlan, "whiteLabelEnabled">) {
  return plan.whiteLabelEnabled;
}

export function canDownloadPdfForSubscription(subscription: AccessSubscription) {
  return (
    subscription.plan.billingType !== "FREE" &&
    hasReportCreditFromCredits(subscription)
  );
}

export function canUseClientManagementForPlan(plan: Pick<AccessPlan, "billingType">) {
  return plan.billingType !== "FREE";
}

export function canUseShareLinksForPlan(plan: Pick<AccessPlan, "billingType">) {
  return plan.billingType !== "FREE";
}

const PROFESSIONAL_SCAN_PLAN_SLUGS = new Set([
  "pro-report",
  "agency-starter",
  "agency-pro",
]);

export function canUseProfessionalScanForPlan(
  plan: Pick<AccessPlan, "billingType" | "slug">,
) {
  if (plan.billingType === "FREE") {
    return false;
  }

  return typeof plan.slug === "string" && PROFESSIONAL_SCAN_PLAN_SLUGS.has(plan.slug);
}
