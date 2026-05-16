import "server-only";

import type { BillingType } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { getActivePlans } from "@/lib/billing";
import {
  normalizePlanEntitlements,
  type PlanEntitlements,
} from "@/lib/billing/planEntitlements";
import { getLemonBillingStatus } from "@/lib/lemon-billing";
import { getStripeBillingStatus } from "@/lib/stripe-billing";

const PUBLIC_PLAN_ORDER = [
  "free-demo",
  "basic-report",
  "pro-report",
  "agency-starter",
  "agency-pro",
  "manual-review-addon",
] as const;

type PublicPlanSlug = (typeof PUBLIC_PLAN_ORDER)[number];

type PlanDefaults = {
  name: string;
  fallbackPrice: string;
  fallbackBillingType: BillingType;
  bestFor: string;
  includes: string[];
  loggedOutCtaLabel: string;
  loggedInCtaLabel: string;
  highlighted?: boolean;
};

const PUBLIC_PLAN_DEFAULTS: Record<PublicPlanSlug, PlanDefaults> = {
  "free-demo": {
    name: "Free Demo",
    fallbackPrice: "0",
    fallbackBillingType: "FREE",
    bestFor: "Testing the scanner.",
    includes: ["Basic Scan only", "3 Basic scans/day", "No PDF reports"],
    loggedOutCtaLabel: "Start free",
    loggedInCtaLabel: "Open billing dashboard",
  },
  "basic-report": {
    name: "Basic Report",
    fallbackPrice: "19",
    fallbackBillingType: "ONE_TIME",
    bestFor: "One basic website report.",
    includes: [
      "Basic Scan only",
      "25 Basic scans/day",
      "1 Basic PDF report",
      "1 report credit",
    ],
    loggedOutCtaLabel: "Create account to choose plan",
    loggedInCtaLabel: "Open billing dashboard",
  },
  "pro-report": {
    name: "Pro Report",
    fallbackPrice: "49",
    fallbackBillingType: "ONE_TIME",
    bestFor: "One professional report with light review.",
    includes: [
      "Professional Scan",
      "1 Professional PDF report",
      "1 Professional scan/day",
      "1 report credit",
      "1 light manual review",
    ],
    loggedOutCtaLabel: "Create account to choose plan",
    loggedInCtaLabel: "Open billing dashboard",
  },
  "agency-starter": {
    name: "Agency Starter",
    fallbackPrice: "49",
    fallbackBillingType: "MONTHLY",
    bestFor: "Small agencies and freelancers.",
    includes: [
      "Professional Scans",
      "25 Professional PDF reports",
      "25 Professional scans/day",
      "25 report credits",
      "White-label branding",
      "Client management",
      "Secure share links",
    ],
    loggedOutCtaLabel: "Create account to choose plan",
    loggedInCtaLabel: "Open billing dashboard",
    highlighted: true,
  },
  "agency-pro": {
    name: "Agency Pro",
    fallbackPrice: "99",
    fallbackBillingType: "MONTHLY",
    bestFor: "Active agencies managing client reports.",
    includes: [
      "Professional Scans",
      "100 Professional PDF reports",
      "100 Professional scans/day",
      "100 report credits",
      "Full white-label branding",
      "Client management",
      "Secure share links",
      "Hide powered-by",
      "Priority guidance/support",
      "Priority guidance included. Deep manual reviews are sold separately.",
    ],
    loggedOutCtaLabel: "Create account to choose plan",
    loggedInCtaLabel: "Open billing dashboard",
  },
  "manual-review-addon": {
    name: "Manual Review Add-on",
    fallbackPrice: "149",
    fallbackBillingType: "ADDON",
    bestFor: "Deep human review of an existing report.",
    includes: [
      "1 deep human review",
      "Requires an existing generated report",
      "No scan or PDF credits included",
      "No agency features included by itself",
    ],
    loggedOutCtaLabel: "Create account",
    loggedInCtaLabel: "Open billing dashboard",
  },
};

type PublicLimitGroup = {
  title: string;
  lines: string[];
};

export type PublicPlanDisplay = {
  slug: PublicPlanSlug;
  name: string;
  priceLabel: string;
  billingTypeLabel: string;
  bestFor: string;
  includes: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted: boolean;
  fullLimits: PublicLimitGroup[];
};

export type PublicPricingContent = {
  plans: PublicPlanDisplay[];
  paymentMessage: string;
  cardPaymentMessage: string;
  isLoggedIn: boolean;
};

function formatPriceLabel(price: string) {
  const numeric = Number(price);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "Free";
  }

  return `$${numeric.toFixed(0)}`;
}

function formatBillingTypeLabel(type: BillingType) {
  if (type === "MONTHLY") {
    return "Monthly";
  }

  if (type === "ONE_TIME") {
    return "One-time";
  }

  if (type === "ADDON") {
    return "One-time add-on";
  }

  return "Free";
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function resolveLoggedOutCtaHref(slug: PublicPlanSlug) {
  if (slug === "free-demo") {
    return "/signup";
  }

  return `/signup?plan=${slug}`;
}

function resolveLoggedInCtaHref(slug: PublicPlanSlug) {
  if (slug === "manual-review-addon") {
    return "/dashboard/billing#manual-payment";
  }

  return `/dashboard/billing?plan=${slug}`;
}

function buildFullLimits(entitlements: PlanEntitlements): PublicLimitGroup[] {
  return [
    {
      title: "Scan access",
      lines: [
        `Basic Scan: ${yesNo(entitlements.allowBasicScan)}`,
        `Professional Scan: ${yesNo(entitlements.allowProfessionalScan)}`,
        `Basic scans/day: ${entitlements.basicScanLimitPerDay}`,
        `Professional scans/day: ${entitlements.professionalScanLimitPerDay}`,
      ],
    },
    {
      title: "PDF and credits",
      lines: [
        `Basic PDF reports: ${yesNo(entitlements.allowBasicPdf)}`,
        `Professional PDF reports: ${yesNo(entitlements.allowProfessionalPdf)}`,
        `Basic PDF credits: ${entitlements.basicPdfCredits}`,
        `Professional PDF credits: ${entitlements.professionalPdfCredits}`,
        `Total report credits: ${entitlements.totalReportCredits}`,
      ],
    },
    {
      title: "Agency features",
      lines: [
        `White-label branding: ${yesNo(entitlements.allowWhiteLabel)}`,
        `Client management: ${yesNo(entitlements.allowClientManagement)}`,
        `Secure share links: ${yesNo(entitlements.allowShareLinks)}`,
        `Hide powered-by: ${yesNo(entitlements.allowHidePoweredBy)}`,
        `Priority support: ${yesNo(entitlements.allowPrioritySupport)}`,
      ],
    },
    {
      title: "Manual review",
      lines: [
        `Light manual review credits: ${entitlements.lightManualReviewCredits}`,
        `Deep manual review credits: ${entitlements.deepManualReviewCredits}`,
        `Priority guidance: ${yesNo(entitlements.allowPriorityGuidance)}`,
      ],
    },
  ];
}

export async function getPublicPricingContent(): Promise<PublicPricingContent> {
  const [user, plans, lemonBilling, stripeBilling] = await Promise.all([
    getCurrentUser(),
    getActivePlans(),
    Promise.resolve(getLemonBillingStatus()),
    Promise.resolve(getStripeBillingStatus()),
  ]);

  const planBySlug = new Map(plans.map((plan) => [plan.slug, plan]));
  const isLoggedIn = Boolean(user);
  const plansToDisplay: PublicPlanDisplay[] = PUBLIC_PLAN_ORDER.map((slug) => {
    const defaults = PUBLIC_PLAN_DEFAULTS[slug];
    const plan = planBySlug.get(slug);
    const entitlements = normalizePlanEntitlements(plan);
    const billingType = plan?.billingType ?? defaults.fallbackBillingType;
    const priceLabel = formatPriceLabel(plan?.price.toString() ?? defaults.fallbackPrice);

    return {
      slug,
      name: plan?.name ?? defaults.name,
      priceLabel,
      billingTypeLabel: formatBillingTypeLabel(billingType),
      bestFor: defaults.bestFor,
      includes: defaults.includes,
      ctaLabel: isLoggedIn ? defaults.loggedInCtaLabel : defaults.loggedOutCtaLabel,
      ctaHref: isLoggedIn ? resolveLoggedInCtaHref(slug) : resolveLoggedOutCtaHref(slug),
      highlighted: Boolean(defaults.highlighted),
      fullLimits: buildFullLimits(entitlements),
    };
  });

  const cardPaymentAvailable =
    lemonBilling.checkoutConfigured || stripeBilling.checkoutConfigured;

  return {
    plans: plansToDisplay,
    paymentMessage:
      "Manual payment is available after login. Submit payment proof from your dashboard. Admin approval is required before credits or plan access are added.",
    cardPaymentMessage: cardPaymentAvailable
      ? "International card payment is available only after provider setup and always starts inside dashboard billing."
      : "International card payment is not available yet. Manual payment remains available after login.",
    isLoggedIn,
  };
}
