import type {
  BillingType,
  PaymentProvider,
  Plan,
  Subscription,
  SubscriptionStatus,
} from "@prisma/client";

import { getPrisma } from "../prisma.ts";

const FREE_PLAN_SLUG = "free-demo";
const FREE_PLAN_FALLBACK_ID = "free-demo-fallback";

// Phase 24B source of truth for backend entitlement checks.
// Keep this module server-side only and do not import into client components.

const LEGACY_PROFESSIONAL_SCAN_SLUGS = new Set([
  "pro-report",
  "agency-starter",
  "agency-pro",
]);

type SubscriptionWithPlan = Subscription & { plan: Plan };
type OptionalPlan = Plan | null | undefined;

export type PlanEntitlements = {
  planId: string;
  planName: string;
  planSlug?: string;
  billingType: BillingType;
  currency: string;
  price: string;
  isActivePlan: boolean;
  provider?: PaymentProvider;
  status?: SubscriptionStatus;
  allowBasicScan: boolean;
  allowProfessionalScan: boolean;
  basicScanLimitPerDay: number;
  professionalScanLimitPerDay: number;
  allowBasicPdf: boolean;
  allowProfessionalPdf: boolean;
  basicPdfCredits: number;
  professionalPdfCredits: number;
  totalReportCredits: number;
  allowManualReview: boolean;
  lightManualReviewCredits: number;
  deepManualReviewCredits: number;
  allowPriorityGuidance: boolean;
  allowWhiteLabel: boolean;
  allowClientManagement: boolean;
  allowShareLinks: boolean;
  allowHidePoweredBy: boolean;
  allowAgencyBranding: boolean;
  allowPrioritySupport: boolean;
  preferredPaymentProvider: string | null;
  stripeEnabled: boolean;
  lemonEnabled: boolean;
  stripeProductId?: string;
  stripePriceId?: string;
  lemonProductId?: string;
  lemonVariantId?: string;
};

export type UserActivePlan = {
  subscription: SubscriptionWithPlan | null;
  plan: Plan | null;
};

export type ScanType = "BASIC" | "PROFESSIONAL";
export type ManualReviewType = "LIGHT" | "DEEP";

export type AccessCheckResult = {
  allowed: boolean;
  reason?: string;
  entitlements: PlanEntitlements;
};

export type ReadablePlanSummary = {
  planName: string;
  billingType: BillingType;
  scanAccessSummary: string;
  pdfAccessSummary: string;
  featureAccessSummary: string;
  manualReviewSummary: string;
};

function toPriceString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  if (value && typeof value === "object" && "toString" in value) {
    return String(value.toString());
  }

  return "0.00";
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asNonNegativeInt(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.floor(value));
}

function hasPaidPlanShape(plan: OptionalPlan) {
  return Boolean(plan && plan.billingType !== "FREE");
}

function legacyAllowBasicScan(plan: Plan) {
  if (plan.slug === "manual-review-addon") {
    return false;
  }

  return plan.billingType !== "ADDON";
}

function legacyAllowProfessionalScan(plan: Plan) {
  return LEGACY_PROFESSIONAL_SCAN_SLUGS.has(plan.slug);
}

function legacyAllowBasicPdf(plan: Plan) {
  if (plan.billingType === "FREE" || plan.slug === "manual-review-addon") {
    return false;
  }

  return plan.reportCredits > 0;
}

function legacyAllowProfessionalPdf(plan: Plan) {
  return legacyAllowProfessionalScan(plan) && plan.reportCredits > 0;
}

function legacyAllowHidePoweredBy(plan: Plan) {
  return Boolean(
    plan.whiteLabelEnabled &&
      (plan.slug === "agency-pro" ||
        plan.name.toLowerCase() === "agency pro" ||
        plan.manualReviewEnabled),
  );
}

function safeFallbackEntitlements(): PlanEntitlements {
  return {
    planId: FREE_PLAN_FALLBACK_ID,
    planName: "Free Demo",
    planSlug: FREE_PLAN_SLUG,
    billingType: "FREE",
    currency: "USD",
    price: "0.00",
    isActivePlan: true,
    allowBasicScan: true,
    allowProfessionalScan: false,
    basicScanLimitPerDay: 3,
    professionalScanLimitPerDay: 0,
    allowBasicPdf: false,
    allowProfessionalPdf: false,
    basicPdfCredits: 0,
    professionalPdfCredits: 0,
    totalReportCredits: 0,
    allowManualReview: false,
    lightManualReviewCredits: 0,
    deepManualReviewCredits: 0,
    allowPriorityGuidance: false,
    allowWhiteLabel: false,
    allowClientManagement: false,
    allowShareLinks: false,
    allowHidePoweredBy: false,
    allowAgencyBranding: false,
    allowPrioritySupport: false,
    preferredPaymentProvider: null,
    stripeEnabled: false,
    lemonEnabled: false,
  };
}

async function getFreeDemoPlan() {
  const prisma = getPrisma();

  return prisma.plan.findFirst({
    where: { slug: FREE_PLAN_SLUG },
    orderBy: { updatedAt: "desc" },
  });
}

function normalizeScanType(scanType: string): ScanType | null {
  const normalized = scanType.toUpperCase();

  if (normalized === "BASIC" || normalized === "PROFESSIONAL") {
    return normalized;
  }

  return null;
}

function normalizeManualReviewType(reviewType: string): ManualReviewType | null {
  const normalized = reviewType.toUpperCase();

  if (normalized === "LIGHT" || normalized === "DEEP") {
    return normalized;
  }

  return null;
}

export function normalizePlanEntitlements(plan: OptionalPlan): PlanEntitlements {
  if (!plan) {
    return safeFallbackEntitlements();
  }

  const billingType = plan.billingType ?? "FREE";
  const isActivePlan = asBoolean(plan.isActive, true);

  let allowBasicScan = asBoolean(plan.allowBasicScan, legacyAllowBasicScan(plan));
  let allowProfessionalScan = asBoolean(
    plan.allowProfessionalScan,
    legacyAllowProfessionalScan(plan),
  );
  let basicScanLimitPerDay = asNonNegativeInt(
    plan.basicScanLimitPerDay,
    allowBasicScan ? 25 : 0,
  );
  let professionalScanLimitPerDay = asNonNegativeInt(
    plan.professionalScanLimitPerDay,
    allowProfessionalScan ? 1 : 0,
  );

  let allowBasicPdf = asBoolean(plan.allowBasicPdf, legacyAllowBasicPdf(plan));
  let allowProfessionalPdf = asBoolean(
    plan.allowProfessionalPdf,
    legacyAllowProfessionalPdf(plan),
  );
  let basicPdfCredits = asNonNegativeInt(
    plan.basicPdfCredits,
    allowBasicPdf && !allowProfessionalPdf ? plan.reportCredits : 0,
  );
  let professionalPdfCredits = asNonNegativeInt(
    plan.professionalPdfCredits,
    allowProfessionalPdf ? plan.reportCredits : 0,
  );
  let totalReportCredits = asNonNegativeInt(plan.totalReportCredits, plan.reportCredits);

  let allowManualReview = asBoolean(plan.allowManualReview, plan.manualReviewEnabled);
  let lightManualReviewCredits = asNonNegativeInt(plan.lightManualReviewCredits, 0);
  let deepManualReviewCredits = asNonNegativeInt(plan.deepManualReviewCredits, 0);
  let allowPriorityGuidance = asBoolean(plan.allowPriorityGuidance, false);

  let allowWhiteLabel = asBoolean(plan.allowWhiteLabel, plan.whiteLabelEnabled);
  let allowClientManagement = asBoolean(
    plan.allowClientManagement,
    plan.clientManagementEnabled,
  );
  let allowShareLinks = asBoolean(plan.allowShareLinks, plan.shareLinkEnabled);
  let allowHidePoweredBy = asBoolean(
    plan.allowHidePoweredBy,
    legacyAllowHidePoweredBy(plan),
  );
  let allowAgencyBranding = asBoolean(plan.allowAgencyBranding, plan.whiteLabelEnabled);
  let allowPrioritySupport = asBoolean(plan.allowPrioritySupport, false);

  // Safety-first policy for new entitlement checks:
  // inactive paid plans do not grant paid capabilities in Phase 24B.
  if (!isActivePlan && hasPaidPlanShape(plan)) {
    allowBasicScan = false;
    allowProfessionalScan = false;
    basicScanLimitPerDay = 0;
    professionalScanLimitPerDay = 0;
    allowBasicPdf = false;
    allowProfessionalPdf = false;
    basicPdfCredits = 0;
    professionalPdfCredits = 0;
    totalReportCredits = 0;
    allowManualReview = false;
    lightManualReviewCredits = 0;
    deepManualReviewCredits = 0;
    allowPriorityGuidance = false;
    allowWhiteLabel = false;
    allowClientManagement = false;
    allowShareLinks = false;
    allowHidePoweredBy = false;
    allowAgencyBranding = false;
    allowPrioritySupport = false;
  }

  return {
    planId: plan.id,
    planName: plan.name,
    planSlug: plan.slug || undefined,
    billingType,
    currency: plan.currency ?? "USD",
    price: toPriceString(plan.price),
    isActivePlan,
    allowBasicScan,
    allowProfessionalScan,
    basicScanLimitPerDay,
    professionalScanLimitPerDay,
    allowBasicPdf,
    allowProfessionalPdf,
    basicPdfCredits,
    professionalPdfCredits,
    totalReportCredits,
    allowManualReview,
    lightManualReviewCredits,
    deepManualReviewCredits,
    allowPriorityGuidance,
    allowWhiteLabel,
    allowClientManagement,
    allowShareLinks,
    allowHidePoweredBy,
    allowAgencyBranding,
    allowPrioritySupport,
    preferredPaymentProvider: plan.preferredPaymentProvider ?? null,
    stripeEnabled: asBoolean(plan.stripeEnabled, plan.isStripeEnabled),
    lemonEnabled: asBoolean(plan.lemonEnabled, false),
    stripeProductId: plan.stripeProductId ?? undefined,
    stripePriceId: plan.stripePriceId ?? undefined,
    lemonProductId: plan.lemonProductId ?? undefined,
    lemonVariantId: plan.lemonVariantId ?? undefined,
  };
}

export async function getUserActivePlan(userId: string): Promise<UserActivePlan> {
  const prisma = getPrisma();

  const paidSubscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      plan: {
        billingType: {
          not: "FREE",
        },
      },
    },
    include: {
      plan: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (paidSubscription) {
    return {
      subscription: paidSubscription,
      plan: paidSubscription.plan,
    };
  }

  const freeSubscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      plan: {
        slug: FREE_PLAN_SLUG,
      },
    },
    include: {
      plan: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  if (freeSubscription) {
    return {
      subscription: freeSubscription,
      plan: freeSubscription.plan,
    };
  }

  const freePlan = await getFreeDemoPlan();

  return {
    subscription: null,
    plan: freePlan,
  };
}

export async function getPlanEntitlementsForUser(userId: string): Promise<PlanEntitlements> {
  const active = await getUserActivePlan(userId);
  const normalized = normalizePlanEntitlements(active.plan);

  if (!active.subscription) {
    return normalized;
  }

  return {
    ...normalized,
    provider: active.subscription.provider,
    status: active.subscription.status,
  };
}

export async function getPlanEntitlementsByPlanId(planId: string): Promise<PlanEntitlements> {
  const prisma = getPrisma();
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });

  if (plan) {
    return normalizePlanEntitlements(plan);
  }

  const freePlan = await getFreeDemoPlan();

  return normalizePlanEntitlements(freePlan);
}

export function canSubmitScanForEntitlements(
  entitlements: PlanEntitlements,
  scanType: string,
): AccessCheckResult {
  const normalizedType = normalizeScanType(scanType);

  if (!normalizedType) {
    return {
      allowed: false,
      reason: "Invalid scan type selected.",
      entitlements,
    };
  }

  if (normalizedType === "BASIC" && !entitlements.allowBasicScan) {
    return {
      allowed: false,
      reason: "Your current plan does not include Basic Scan.",
      entitlements,
    };
  }

  if (normalizedType === "PROFESSIONAL" && !entitlements.allowProfessionalScan) {
    return {
      allowed: false,
      reason: "Your current plan does not include Professional Scan.",
      entitlements,
    };
  }

  return { allowed: true, entitlements };
}

export async function canSubmitScan(userId: string, scanType: string): Promise<AccessCheckResult> {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return canSubmitScanForEntitlements(entitlements, scanType);
}

export function canGeneratePdfForEntitlements(
  entitlements: PlanEntitlements,
  scanType: string,
): AccessCheckResult {
  const normalizedType = normalizeScanType(scanType);

  if (!normalizedType) {
    return {
      allowed: false,
      reason: "Unknown scan type.",
      entitlements,
    };
  }

  if (normalizedType === "BASIC" && !entitlements.allowBasicPdf) {
    return {
      allowed: false,
      reason: "Your current plan does not include Basic PDF reports.",
      entitlements,
    };
  }

  if (normalizedType === "PROFESSIONAL" && !entitlements.allowProfessionalPdf) {
    return {
      allowed: false,
      reason: "Your current plan does not include Professional PDF reports.",
      entitlements,
    };
  }

  return { allowed: true, entitlements };
}

export async function canGeneratePdf(
  userId: string,
  scanType: string,
): Promise<AccessCheckResult> {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return canGeneratePdfForEntitlements(entitlements, scanType);
}

export async function canUseWhiteLabel(userId: string) {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return canUseWhiteLabelForEntitlements(entitlements);
}

export async function canUseAgencyBranding(userId: string) {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return canUseAgencyBrandingForEntitlements(entitlements);
}

export async function canUseClientManagement(userId: string) {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return canUseClientManagementForEntitlements(entitlements);
}

export async function canCreateShareLink(userId: string) {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return canCreateShareLinkForEntitlements(entitlements);
}

export async function canHidePoweredBy(userId: string) {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return canHidePoweredByForEntitlements(entitlements);
}

export function canUseWhiteLabelForEntitlements(entitlements: PlanEntitlements) {
  return entitlements.allowWhiteLabel || entitlements.allowAgencyBranding;
}

export function canUseAgencyBrandingForEntitlements(entitlements: PlanEntitlements) {
  return entitlements.allowAgencyBranding;
}

export function canUseClientManagementForEntitlements(entitlements: PlanEntitlements) {
  return entitlements.allowClientManagement;
}

export function canCreateShareLinkForEntitlements(entitlements: PlanEntitlements) {
  return entitlements.allowShareLinks;
}

export function canHidePoweredByForEntitlements(entitlements: PlanEntitlements) {
  return entitlements.allowHidePoweredBy;
}

export function canUseManualReviewForEntitlements(
  entitlements: PlanEntitlements,
  reviewType: string,
): AccessCheckResult {
  const normalizedType = normalizeManualReviewType(reviewType);

  if (!normalizedType) {
    return {
      allowed: false,
      reason: "Unknown manual review type.",
      entitlements,
    };
  }

  if (normalizedType === "LIGHT") {
    const allowed =
      entitlements.allowPriorityGuidance ||
      (entitlements.allowManualReview && entitlements.lightManualReviewCredits > 0);

    return allowed
      ? { allowed: true, entitlements }
      : {
          allowed: false,
          reason: "Light manual review is not included in your current plan.",
          entitlements,
        };
  }

  if (entitlements.allowManualReview && entitlements.deepManualReviewCredits > 0) {
    return { allowed: true, entitlements };
  }

  return {
    allowed: false,
    reason: "Deep manual review requires a manual review add-on.",
    entitlements,
  };
}

export async function canUseManualReview(
  userId: string,
  reviewType: string,
): Promise<AccessCheckResult> {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return canUseManualReviewForEntitlements(entitlements, reviewType);
}

export function canUsePriorityGuidanceForEntitlements(entitlements: PlanEntitlements) {
  return entitlements.allowPriorityGuidance;
}

export function canUsePrioritySupportForEntitlements(entitlements: PlanEntitlements) {
  return entitlements.allowPrioritySupport;
}

export async function canUsePriorityGuidance(userId: string) {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return canUsePriorityGuidanceForEntitlements(entitlements);
}

export async function canUsePrioritySupport(userId: string) {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return canUsePrioritySupportForEntitlements(entitlements);
}

export function buildReadablePlanSummary(entitlements: PlanEntitlements): ReadablePlanSummary {
  const scanParts = [
    entitlements.allowBasicScan ? "Basic scan enabled" : "Basic scan disabled",
    entitlements.allowProfessionalScan
      ? "Professional scan enabled"
      : "Professional scan disabled",
  ];
  const pdfParts = [
    entitlements.allowBasicPdf
      ? `Basic PDF enabled (${entitlements.basicPdfCredits} credits)`
      : "Basic PDF disabled",
    entitlements.allowProfessionalPdf
      ? `Professional PDF enabled (${entitlements.professionalPdfCredits} credits)`
      : "Professional PDF disabled",
    `Total report credits: ${entitlements.totalReportCredits}`,
  ];
  const featureParts = [
    entitlements.allowWhiteLabel || entitlements.allowAgencyBranding
      ? "White-label enabled"
      : "White-label disabled",
    entitlements.allowAgencyBranding ? "Agency branding enabled" : "Agency branding disabled",
    entitlements.allowClientManagement
      ? "Client management enabled"
      : "Client management disabled",
    entitlements.allowShareLinks ? "Share links enabled" : "Share links disabled",
    entitlements.allowHidePoweredBy ? "Hide Powered by enabled" : "Hide Powered by disabled",
    entitlements.allowPrioritySupport ? "Priority support enabled" : "Priority support disabled",
  ];
  const manualReviewParts = [
    entitlements.allowManualReview ? "Manual review enabled" : "Manual review disabled",
    `Light credits: ${entitlements.lightManualReviewCredits}`,
    `Deep credits: ${entitlements.deepManualReviewCredits}`,
    entitlements.allowPriorityGuidance
      ? "Priority guidance enabled"
      : "Priority guidance disabled",
  ];

  return {
    planName: entitlements.planName,
    billingType: entitlements.billingType,
    scanAccessSummary: scanParts.join(" | "),
    pdfAccessSummary: pdfParts.join(" | "),
    featureAccessSummary: featureParts.join(" | "),
    manualReviewSummary: manualReviewParts.join(" | "),
  };
}

export async function getReadablePlanSummary(userId: string): Promise<ReadablePlanSummary> {
  const entitlements = await getPlanEntitlementsForUser(userId);

  return buildReadablePlanSummary(entitlements);
}
