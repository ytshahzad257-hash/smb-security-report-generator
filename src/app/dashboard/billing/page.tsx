import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, CheckCircle2, CreditCard, ReceiptText, WalletCards, XCircle } from "lucide-react";

import { cancelPendingPaymentRequest } from "@/app/actions/billing";
import { CancelSubmitButton } from "@/components/billing/cancel-payment-request-button";
import { LemonCheckoutButton } from "@/components/billing/lemon-checkout-button";
import { ManualPaymentForm } from "@/components/billing/manual-payment-form";
import { StripeCheckoutButton } from "@/components/billing/stripe-checkout-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { requireUser } from "@/lib/auth";
import { getActivePlans, getUserSubscription } from "@/lib/billing";
import {
  getPlanEntitlementsForUser,
  getReadablePlanSummary,
  normalizePlanEntitlements,
  type PlanEntitlements,
} from "@/lib/billing/planEntitlements";
import { getLemonVariantIdForPlanSlug } from "@/lib/lemon";
import { getLemonBillingStatus, resolvePlanLemonMode } from "@/lib/lemon-billing";
import {
  getManualPaymentMethods,
  getManualPaymentOptions,
} from "@/lib/manual-payments";
import { getPrisma } from "@/lib/prisma";
import { getStripeBillingStatus, resolvePlanStripeMode } from "@/lib/stripe-billing";

export const metadata: Metadata = {
  title: "Billing",
  description: "Plans, subscriptions, and report credits.",
};

type BillingHistoryStatus =
  | "ACTIVE"
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "COMING SOON";

type BillingHistoryProvider = "MANUAL" | "LEMON" | "STRIPE";

type BillingHistoryRow = {
  key: string;
  packageName: string;
  amount: unknown;
  currency: string;
  provider: BillingHistoryProvider;
  status: BillingHistoryStatus;
  credits: number;
  createdAt: Date;
  updatedAt: Date | null;
  proofUrl?: string | null;
  adminNote?: string | null;
  requestId?: string;
  canCancel?: boolean;
};

function formatDate(date: Date | null | undefined) {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

function formatPrice(price: unknown, currency: string) {
  const value = Number(price);

  if (value === 0) {
    return "Free";
  }

  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBillingType(type: string) {
  return type
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function billingBadgeVariant(type: string) {
  if (type === "FREE") {
    return "success" as const;
  }

  if (type === "MONTHLY") {
    return "secondary" as const;
  }

  if (type === "ONE_TIME") {
    return "outline" as const;
  }

  return "warning" as const;
}

function historyStatusVariant(status: BillingHistoryStatus) {
  if (status === "ACTIVE" || status === "APPROVED" || status === "PAID") {
    return "success" as const;
  }

  if (status === "FAILED" || status === "REJECTED") {
    return "destructive" as const;
  }

  if (status === "PENDING" || status === "COMING SOON") {
    return "warning" as const;
  }

  return "outline" as const;
}

function includedLabel(included: boolean) {
  return included ? "Included" : "Not included";
}

function getCurrentDayWindow(now = new Date()) {
  // Use server-local day boundaries to match existing daily scan limit enforcement.
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return { dayStart, dayEnd };
}

function asSafeWholeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function calculateRemaining(allowed: number | null, used: number | null) {
  if (allowed === null || used === null) {
    return null;
  }

  return Math.max(0, allowed - used);
}

function getCompactIncludedItems(entitlements: PlanEntitlements) {
  const items: string[] = [];

  if (entitlements.allowBasicScan) {
    items.push("Basic Scan");
  }
  if (entitlements.allowProfessionalScan) {
    items.push("Professional Scan");
  }
  if (entitlements.basicScanLimitPerDay > 0) {
    items.push(`${entitlements.basicScanLimitPerDay} Basic scans/day`);
  }
  if (entitlements.professionalScanLimitPerDay > 0) {
    items.push(`${entitlements.professionalScanLimitPerDay} Professional scans/day`);
  }
  if (entitlements.allowBasicPdf) {
    items.push("Basic PDF reports");
  }
  if (entitlements.allowProfessionalPdf) {
    items.push("Professional PDF reports");
  }
  if (entitlements.totalReportCredits > 0) {
    items.push(`${entitlements.totalReportCredits} total report credits`);
  }
  if (entitlements.allowWhiteLabel) {
    items.push("White-label branding");
  }
  if (entitlements.allowAgencyBranding) {
    items.push("Agency branding");
  }
  if (entitlements.allowClientManagement) {
    items.push("Client management");
  }
  if (entitlements.allowShareLinks) {
    items.push("Secure share links");
  }
  if (entitlements.allowHidePoweredBy) {
    items.push("Hide powered-by");
  }
  if (entitlements.allowPrioritySupport) {
    items.push("Priority support");
  }
  if (entitlements.lightManualReviewCredits > 0) {
    items.push(`${entitlements.lightManualReviewCredits} light manual review included`);
  }
  if (entitlements.deepManualReviewCredits > 0) {
    items.push(`${entitlements.deepManualReviewCredits} deep manual review included`);
  }
  if (entitlements.allowPriorityGuidance) {
    items.push("Priority guidance included");
  }

  return Array.from(new Set(items));
}

function getBestForLine(slug: string) {
  switch (slug) {
    case "free-demo":
      return "Best for testing the scanner.";
    case "basic-report":
      return "Best for one basic website report.";
    case "pro-report":
      return "Best for one professional report with light review.";
    case "agency-starter":
      return "Best for small agencies and freelancers.";
    case "agency-pro":
      return "Best for active agencies managing client reports.";
    case "manual-review-addon":
      return "Best for deep human review of an existing report.";
    default:
      return "Best for this plan's included features.";
  }
}

function pushFeatureLine(lines: string[], included: boolean, label: string) {
  if (included) {
    lines.push(label);
  }
}

function withCount(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function getIncludedSummaryLines(
  entitlements: PlanEntitlements,
  slug: string,
): string[] {
  const lines: string[] = [];

  if (entitlements.allowProfessionalScan) {
    lines.push("Professional Scans");
  } else if (entitlements.allowBasicScan) {
    lines.push("Basic Scan only");
  }

  if (entitlements.allowProfessionalPdf && entitlements.professionalPdfCredits > 0) {
    lines.push(
      withCount(
        entitlements.professionalPdfCredits,
        "Professional PDF report",
        "Professional PDF reports",
      ),
    );
  } else if (entitlements.allowBasicPdf && entitlements.basicPdfCredits > 0) {
    lines.push(
      withCount(entitlements.basicPdfCredits, "Basic PDF report", "Basic PDF reports"),
    );
  } else if (!entitlements.allowBasicPdf && !entitlements.allowProfessionalPdf) {
    lines.push("No PDF reports");
  }

  if (entitlements.allowProfessionalScan && entitlements.professionalScanLimitPerDay > 0) {
    lines.push(`${entitlements.professionalScanLimitPerDay} Professional scans/day`);
  } else if (entitlements.allowBasicScan && entitlements.basicScanLimitPerDay > 0) {
    lines.push(`${entitlements.basicScanLimitPerDay} Basic scans/day`);
  }

  if (entitlements.totalReportCredits > 0) {
    lines.push(withCount(entitlements.totalReportCredits, "report credit", "report credits"));
  }

  if (entitlements.lightManualReviewCredits > 0) {
    lines.push(`Light manual review: ${entitlements.lightManualReviewCredits} included`);
  }

  if (entitlements.deepManualReviewCredits > 0) {
    lines.push(`Deep manual review: ${entitlements.deepManualReviewCredits} included`);
  }

  if (entitlements.allowWhiteLabel) {
    lines.push(
      entitlements.allowHidePoweredBy ? "Full white-label branding" : "White-label branding",
    );
  }

  pushFeatureLine(lines, entitlements.allowClientManagement, "Client management");
  pushFeatureLine(lines, entitlements.allowShareLinks, "Secure share links");
  pushFeatureLine(lines, entitlements.allowHidePoweredBy, "Hide powered-by");
  pushFeatureLine(lines, entitlements.allowPriorityGuidance, "Priority guidance included");
  pushFeatureLine(lines, entitlements.allowPrioritySupport, "Priority support included");

  if (slug === "agency-pro" && entitlements.deepManualReviewCredits === 0) {
    lines.push("Priority guidance included. Deep manual reviews are sold separately.");
  }

  if (slug === "manual-review-addon") {
    if (entitlements.deepManualReviewCredits > 0) {
      lines.push(`${entitlements.deepManualReviewCredits} deep human review`);
    } else {
      lines.push("Deep human review");
    }

    lines.push("Requires an existing generated report.");
    lines.push("No scan or PDF credits included.");
  }

  if (lines.length === 0) {
    lines.push("Automated safe checks");
    lines.push("Security posture report");
  }

  return Array.from(new Set(lines));
}

function paymentToHistoryStatus(payment: { status: string; provider: string }): BillingHistoryStatus {
  if (payment.status === "APPROVED") {
    return payment.provider === "MANUAL" ? "APPROVED" : "PAID";
  }

  if (payment.status === "PENDING") {
    return "PENDING";
  }

  if (payment.status === "REJECTED") {
    return "REJECTED";
  }

  if (payment.status === "FAILED") {
    return "FAILED";
  }

  if (payment.status === "REFUNDED") {
    return "CANCELLED";
  }

  return "CANCELLED";
}

function requestToHistoryStatus(status: string): BillingHistoryStatus {
  if (
    status === "PENDING" ||
    status === "APPROVED" ||
    status === "REJECTED" ||
    status === "CANCELLED"
  ) {
    return status;
  }

  return "CANCELLED";
}

function isLikelyManualApprovalMatch(
  request: {
    packageName: string;
    amount: unknown;
    currency: string;
    reportCredits: number;
    transactionReference: string | null;
    reviewedAt: Date | null;
    updatedAt: Date;
  },
  payment: {
    provider: string;
    status: string;
    packageName: string | null;
    amount: unknown;
    currency: string;
    reportCredits: number;
    transactionRef: string | null;
    createdAt: Date;
  },
) {
  if (payment.provider !== "MANUAL" || payment.status !== "APPROVED") {
    return false;
  }

  if ((payment.packageName ?? "") !== request.packageName) {
    return false;
  }

  if (Number(payment.amount) !== Number(request.amount)) {
    return false;
  }

  if (payment.currency !== request.currency) {
    return false;
  }

  if (payment.reportCredits !== request.reportCredits) {
    return false;
  }

  if (
    request.transactionReference &&
    payment.transactionRef &&
    request.transactionReference !== payment.transactionRef
  ) {
    return false;
  }

  const reviewPoint = request.reviewedAt ?? request.updatedAt;

  return Math.abs(payment.createdAt.getTime() - reviewPoint.getTime()) <= 14 * 24 * 60 * 60 * 1000;
}

function buildBillingHistoryRows(input: {
  paymentRequests: Array<{
    id: string;
    packageName: string;
    amount: unknown;
    currency: string;
    reportCredits: number;
    paymentMethod: string;
    transactionReference: string | null;
    proofUrl: string | null;
    status: string;
    adminNote: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  recentPayments: Array<{
    id: string;
    packageName: string | null;
    amount: unknown;
    currency: string;
    provider: string;
    status: string;
    reportCredits: number;
    proofUrl: string | null;
    transactionRef: string | null;
    createdAt: Date;
    updatedAt: Date;
    plan: { name: string } | null;
    creditPackage: { name: string } | null;
  }>;
}) {
  const usedPaymentIds = new Set<string>();
  const rows: BillingHistoryRow[] = [];

  for (const request of input.paymentRequests) {
    const matchedPayment =
      request.status === "APPROVED"
        ? input.recentPayments.find(
            (payment) =>
              !usedPaymentIds.has(payment.id) &&
              isLikelyManualApprovalMatch(request, payment),
          )
        : null;

    if (matchedPayment) {
      usedPaymentIds.add(matchedPayment.id);
      rows.push({
        key: `combined-${request.id}-${matchedPayment.id}`,
        packageName: request.packageName,
        amount: request.amount,
        currency: request.currency,
        provider: "MANUAL",
        status: "APPROVED",
        credits: request.reportCredits,
        createdAt: request.createdAt,
        updatedAt: request.reviewedAt ?? matchedPayment.updatedAt,
        proofUrl: request.proofUrl ?? matchedPayment.proofUrl,
        adminNote: request.adminNote,
      });
      continue;
    }

    rows.push({
      key: `request-${request.id}`,
      packageName: request.packageName,
      amount: request.amount,
      currency: request.currency,
      provider: "MANUAL",
      status: requestToHistoryStatus(request.status),
      credits: request.reportCredits,
      createdAt: request.createdAt,
      updatedAt: request.reviewedAt ?? request.updatedAt,
      proofUrl: request.proofUrl,
      adminNote: request.adminNote,
      requestId: request.id,
      canCancel: request.status === "PENDING",
    });
  }

  for (const payment of input.recentPayments) {
    if (usedPaymentIds.has(payment.id)) {
      continue;
    }

    if (payment.provider !== "MANUAL" && payment.provider !== "LEMON" && payment.provider !== "STRIPE") {
      continue;
    }

    rows.push({
      key: `payment-${payment.id}`,
      packageName:
        payment.packageName ??
        payment.creditPackage?.name ??
        payment.plan?.name ??
        "Payment",
      amount: payment.amount,
      currency: payment.currency,
      provider: payment.provider,
      status: paymentToHistoryStatus(payment),
      credits: payment.reportCredits,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      proofUrl: payment.provider === "MANUAL" ? payment.proofUrl : null,
    });
  }

  return rows.sort((a, b) => {
    if (b.createdAt.getTime() !== a.createdAt.getTime()) {
      return b.createdAt.getTime() - a.createdAt.getTime();
    }

    return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
  });
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string; lemon?: string; limit?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const prisma = getPrisma();
  const { dayEnd, dayStart } = getCurrentDayWindow();
  const [
    subscription,
    plans,
    paymentOptions,
    paymentMethods,
    paymentRequests,
    recentPayments,
    currentEntitlements,
    readablePlanSummary,
    scansTodayByType,
  ] = await Promise.all([
      getUserSubscription(user.id),
      getActivePlans(),
      getManualPaymentOptions(),
      Promise.resolve(getManualPaymentMethods()),
      prisma.manualPaymentRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.payment.findMany({
        where: { userId: user.id },
        include: {
          plan: { select: { name: true } },
          creditPackage: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      getPlanEntitlementsForUser(user.id),
      getReadablePlanSummary(user.id),
      prisma.scan.groupBy({
        by: ["scanType"],
        where: {
          userId: user.id,
          scanType: {
            in: ["BASIC", "PROFESSIONAL"],
          },
          createdAt: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

  const lemonBilling = getLemonBillingStatus();
  const stripeBilling = getStripeBillingStatus();
  const compactIncludedItems = getCompactIncludedItems(currentEntitlements);
  const hasConfiguredPaymentMethod = paymentMethods.length > 0;
  const pendingRequest = paymentRequests.find((request) => request.status === "PENDING");
  const hasPendingRequest = Boolean(pendingRequest);
  const lemonNotice =
    params.lemon === "success"
      ? "Payment completed. Access updates after Lemon Squeezy confirmation."
      : params.lemon === "cancelled"
        ? "Lemon Squeezy checkout was cancelled. No Lemon payment was recorded."
        : null;
  const unifiedHistory = buildBillingHistoryRows({ paymentRequests, recentPayments });
  const basicScansUsedToday =
    scansTodayByType.find((row) => row.scanType === "BASIC")?._count._all ?? 0;
  const professionalScansUsedToday =
    scansTodayByType.find((row) => row.scanType === "PROFESSIONAL")?._count._all ?? 0;
  const basicScanLimit = asSafeWholeNumber(currentEntitlements.basicScanLimitPerDay);
  const professionalScanLimit = asSafeWholeNumber(
    currentEntitlements.professionalScanLimitPerDay,
  );
  const creditsTotal = asSafeWholeNumber(subscription.creditsTotal);
  const creditsUsed = asSafeWholeNumber(subscription.creditsUsed);
  const basicScansRemainingToday =
    currentEntitlements.allowBasicScan && basicScanLimit !== null
      ? calculateRemaining(basicScanLimit, basicScansUsedToday)
      : null;
  const professionalScansRemainingToday =
    currentEntitlements.allowProfessionalScan && professionalScanLimit !== null
      ? calculateRemaining(professionalScanLimit, professionalScansUsedToday)
      : null;
  const reportCreditsRemaining = calculateRemaining(creditsTotal, creditsUsed);
  const basicPdfIncluded = currentEntitlements.allowBasicPdf;
  const professionalPdfIncluded = currentEntitlements.allowProfessionalPdf;
  const lightManualReviewCredits = asSafeWholeNumber(
    currentEntitlements.lightManualReviewCredits,
  );
  const deepManualReviewCredits = asSafeWholeNumber(
    currentEntitlements.deepManualReviewCredits,
  );

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Billing"
        title="Plans and Credits"
        description="Manage your plan, report credits, manual payments, and billing history."
        actions={
          <Button asChild>
            <Link href="#manual-payment">Manual payment</Link>
          </Button>
        }
      />

      {lemonNotice ? (
        <Alert variant={params.lemon === "success" ? "info" : "warning"}>
          {params.lemon === "success" ? (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          ) : (
            <AlertCircle className="size-4" aria-hidden="true" />
          )}
          <div>
            <AlertTitle>
              {params.lemon === "success" ? "Payment confirmation pending" : "Checkout cancelled"}
            </AlertTitle>
            <AlertDescription>{lemonNotice}</AlertDescription>
          </div>
        </Alert>
      ) : null}

      {params.limit === "scan" || params.limit === "pdf" ? (
        <Alert variant="warning">
          <AlertCircle className="size-4" aria-hidden="true" />
          <div>
            <AlertTitle>Plan limit reached</AlertTitle>
            <AlertDescription>
              Choose a higher plan or submit a manual payment request to increase your
              scan and PDF capacity.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      {subscription.status === "PAST_DUE" ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <div>
            <AlertTitle>Subscription past due</AlertTitle>
            <AlertDescription>
              A recent billing cycle is pending. Submit a manual payment request while
              your payment status is being resolved.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current plan"
          value={subscription.plan.name}
          icon={<CreditCard className="size-5" aria-hidden="true" />}
        />
        <StatCard
          label="Credits remaining"
          value={String(subscription.creditsRemaining)}
          icon={<WalletCards className="size-5" aria-hidden="true" />}
        />
        <StatCard
          label="Status"
          value={subscription.status}
          icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
        />
        <StatCard
          label="Period end"
          value={formatDate(subscription.currentPeriodEnd)}
          icon={<CreditCard className="size-5" aria-hidden="true" />}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <details id="current-plan-details" className="rounded-md border border-border bg-background p-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              View details
            </summary>
            <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">Provider</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{subscription.provider}</p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">Credits total</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{subscription.creditsTotal}</p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">Credits used</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{subscription.creditsUsed}</p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">Current period start</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatDate(subscription.currentPeriodStart)}
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground">Current period end</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatDate(subscription.currentPeriodEnd)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              {readablePlanSummary.scanAccessSummary}
            </p>
            <div className="mt-4 rounded-md border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                Usage remaining
              </p>
              <div className="mt-2 grid min-w-0 gap-2 text-sm">
                <div className="rounded-sm border border-border/80 bg-background/40 px-2.5 py-2">
                  <p className="font-medium text-foreground">Basic scans today</p>
                  {currentEntitlements.allowBasicScan && basicScanLimit !== null ? (
                    <>
                      <p className="text-muted-foreground">
                        {basicScansUsedToday} used / {basicScanLimit} allowed
                      </p>
                      <p className="text-muted-foreground">
                        {basicScansRemainingToday ?? "Unavailable"} remaining today
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Not included</p>
                  )}
                </div>

                <div className="rounded-sm border border-border/80 bg-background/40 px-2.5 py-2">
                  <p className="font-medium text-foreground">Professional scans today</p>
                  {currentEntitlements.allowProfessionalScan &&
                  professionalScanLimit !== null ? (
                    <>
                      <p className="text-muted-foreground">
                        {professionalScansUsedToday} used / {professionalScanLimit} allowed
                      </p>
                      <p className="text-muted-foreground">
                        {professionalScansRemainingToday ?? "Unavailable"} remaining today
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Not included</p>
                  )}
                </div>

                <div className="rounded-sm border border-border/80 bg-background/40 px-2.5 py-2">
                  <p className="font-medium text-foreground">Report credits</p>
                  {creditsTotal !== null && creditsUsed !== null ? (
                    <>
                      <p className="text-muted-foreground">
                        {creditsUsed} used / {creditsTotal} total
                      </p>
                      <p className="text-muted-foreground">
                        {reportCreditsRemaining ?? "Unavailable"} remaining
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Unavailable</p>
                  )}
                </div>

                <div className="rounded-sm border border-border/80 bg-background/40 px-2.5 py-2">
                  <p className="font-medium text-foreground">Basic PDF reports</p>
                  <p className="text-muted-foreground">
                    {basicPdfIncluded
                      ? currentEntitlements.basicPdfCredits > 0
                        ? `${currentEntitlements.basicPdfCredits} included`
                        : "Included"
                      : "Not included"}
                  </p>
                </div>

                <div className="rounded-sm border border-border/80 bg-background/40 px-2.5 py-2">
                  <p className="font-medium text-foreground">Professional PDF reports</p>
                  <p className="text-muted-foreground">
                    {professionalPdfIncluded
                      ? currentEntitlements.professionalPdfCredits > 0
                        ? `${currentEntitlements.professionalPdfCredits} included`
                        : "Included"
                      : "Not included"}
                  </p>
                  {(basicPdfIncluded || professionalPdfIncluded) && (
                    <p className="text-xs text-muted-foreground">
                      Report credits are shared across PDF reports.
                    </p>
                  )}
                </div>

                <div className="rounded-sm border border-border/80 bg-background/40 px-2.5 py-2">
                  <p className="font-medium text-foreground">Manual reviews</p>
                  <p className="text-muted-foreground">
                    Light manual review:{" "}
                    {currentEntitlements.allowManualReview || currentEntitlements.allowPriorityGuidance
                      ? `${lightManualReviewCredits ?? "Unavailable"} remaining`
                      : "Not included"}
                  </p>
                  <p className="text-muted-foreground">
                    Deep manual review:{" "}
                    {currentEntitlements.allowManualReview
                      ? `${deepManualReviewCredits ?? "Unavailable"} remaining`
                      : "Not included"}
                  </p>
                  <p className="text-muted-foreground">
                    Priority guidance: {includedLabel(currentEntitlements.allowPriorityGuidance)}
                  </p>
                </div>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your plan includes</CardTitle>
          <CardDescription>
            Current access based on your active plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {compactIncludedItems.length > 0 ? (
            <div className="flex min-w-0 flex-wrap gap-2">
              {compactIncludedItems.map((item) => (
                <Badge key={item} variant="success" className="max-w-full whitespace-normal break-words">
                  {item}
                </Badge>
              ))}
            </div>
          ) : currentEntitlements.allowBasicScan ? (
            <p className="text-sm text-muted-foreground">
              Basic Scan access is available on your current plan.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Plan access details are temporarily unavailable.
            </p>
          )}
          {currentEntitlements.allowPriorityGuidance &&
          currentEntitlements.deepManualReviewCredits === 0 ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Deep manual reviews are sold separately.
            </p>
          ) : null}
          {/* <div>
            <Button asChild variant="link" className="h-auto p-0 text-sm">
              <Link href="#current-plan-details">View full plan details</Link>
            </Button>
          </div> */}
        </CardContent>
      </Card>

      <section className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card id="manual-payment-options" className="scroll-mt-6">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Manual Payment</CardTitle>
                <CardDescription>Bank transfer, EasyPaisa, JazzCash, or manual transfer.</CardDescription>
              </div>
              <Badge variant="success">ACTIVE</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <p>Admin approval is required before plan access or credits are added.</p>
            <Button asChild variant="outline">
              <Link href="#manual-payment">Submit proof</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>International Card Payment</CardTitle>
                <CardDescription>Lemon Squeezy hosted checkout.</CardDescription>
              </div>
              <Badge variant={lemonBilling.checkoutConfigured ? "success" : "warning"}>
                {lemonBilling.checkoutConfigured ? "ACTIVE" : "COMING SOON"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {lemonBilling.checkoutConfigured ? (
              <p className="text-sm leading-6 text-muted-foreground">
                Card checkout is available. Plan and credit activation still occurs only
                after verified webhook confirmation.
              </p>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                International card payment is not available yet. Manual payment remains
                available.
              </p>
            )}
            {lemonBilling.checkoutConfigured ? (
              <Button asChild variant="outline">
                <Link href="#available-plans">
                  <CreditCard aria-hidden="true" />
                  View Card Payment Options
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {stripeBilling.checkoutConfigured ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Stripe Card Payment</CardTitle>
                  <CardDescription>Secure card checkout.</CardDescription>
                </div>
                <Badge variant="success">ACTIVE</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-sm leading-6 text-muted-foreground">
                Stripe card checkout is available for eligible plans and still activates only
                after verified payment events.
              </p>
              <Button asChild variant="outline">
                <Link href="#available-plans">
                  <CreditCard aria-hidden="true" />
                  View Card Payment Options
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <Card id="manual-payment" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Submit manual payment</CardTitle>
          <CardDescription>
            Select a plan or credit package, pay through a configured method, then
            upload proof for admin review.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {hasPendingRequest ? (
            <Alert variant="warning">
              <WalletCards className="size-4" aria-hidden="true" />
              <div>
                <AlertTitle>Payment approval is pending</AlertTitle>
                <AlertDescription>
                  {pendingRequest?.packageName} is pending admin approval. Cancel this
                  request before submitting another manual payment request.
                </AlertDescription>
              </div>
            </Alert>
          ) : null}

          {pendingRequest ? (
            <div className="grid gap-3 rounded-md border border-border bg-background p-4 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words text-sm font-semibold text-foreground">
                    {pendingRequest.packageName}
                  </p>
                  <Badge variant="warning">PENDING</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatPrice(pendingRequest.amount, pendingRequest.currency)} via{" "}
                  {formatBillingType(pendingRequest.paymentMethod)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Submitted {formatDate(pendingRequest.createdAt)}
                </p>
              </div>
              <form action={cancelPendingPaymentRequest} className="self-start">
                <input type="hidden" name="requestId" value={pendingRequest.id} />
                <CancelSubmitButton />
              </form>
            </div>
          ) : hasConfiguredPaymentMethod ? (
            <ManualPaymentForm methods={paymentMethods} options={paymentOptions} />
          ) : (
            <Alert variant="warning">
              <XCircle className="size-4" aria-hidden="true" />
              <div>
                <AlertTitle>Manual payment details are not configured</AlertTitle>
                <AlertDescription>
                  Manual payment details are not configured. Contact support.
                </AlertDescription>
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>
            Manual requests stay pending until admin review. Card payment access updates
            only after verified webhook confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unifiedHistory.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              No payment records yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {unifiedHistory.map((entry) => (
                <div
                  key={entry.key}
                  className="grid gap-3 rounded-md border border-border bg-background p-4 md:grid-cols-[1.2fr_0.9fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-sm font-semibold text-foreground">
                        {entry.packageName}
                      </p>
                      <Badge
                        variant={
                          entry.provider === "LEMON"
                            ? "success"
                            : entry.provider === "STRIPE"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {entry.provider}
                      </Badge>
                      <Badge variant={historyStatusVariant(entry.status)}>{entry.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatPrice(entry.amount, entry.currency)}
                    </p>
                    {entry.adminNote ? (
                      <p className="mt-2 break-words rounded-md border border-destructive/35 bg-destructive/10 p-2 text-xs leading-5 text-destructive">
                        {entry.adminNote}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-1 text-sm text-muted-foreground">
                    <span>{entry.credits} report credits</span>
                    <span>Created {formatDate(entry.createdAt)}</span>
                    <span>Updated {formatDate(entry.updatedAt)}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {entry.provider === "MANUAL" && entry.proofUrl ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={entry.proofUrl} target="_blank">
                          <ReceiptText aria-hidden="true" />
                          Proof
                        </Link>
                      </Button>
                    ) : null}
                    {entry.canCancel && entry.requestId ? (
                      <form action={cancelPendingPaymentRequest}>
                        <input type="hidden" name="requestId" value={entry.requestId} />
                        <CancelSubmitButton />
                      </form>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section id="available-plans" className="grid min-w-0 scroll-mt-6 gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Available Plans</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Choose a plan and use manual payment, or card checkout when international card
            payment is configured.
          </p>
        </div>

        {plans.length === 0 ? (
          <Alert variant="warning">
            <XCircle className="size-4" aria-hidden="true" />
            <div>
              <AlertTitle>No plans found</AlertTitle>
              <AlertDescription>Seed plans before using billing flows.</AlertDescription>
            </div>
          </Alert>
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const planEntitlements = normalizePlanEntitlements(plan);
              const isCurrent = plan.id === subscription.planId;
              const lemonMode = resolvePlanLemonMode(plan);
              const lemonReady =
                lemonBilling.checkoutConfigured &&
                plan.billingType !== "FREE" &&
                Boolean(getLemonVariantIdForPlanSlug(plan.slug));
              const stripeMode = resolvePlanStripeMode(plan);
              const stripeReady =
                stripeBilling.checkoutConfigured &&
                plan.billingType !== "FREE" &&
                plan.isStripeEnabled &&
                Boolean(plan.stripePriceId);
              return (
                <Card key={plan.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="break-words">{plan.name}</CardTitle>
                        <CardDescription>
                          {formatPrice(plan.price, plan.currency)} {plan.currency}
                        </CardDescription>
                      </div>
                      {isCurrent ? <Badge variant="success">ACTIVE</Badge> : null}
                    </div>
                  </CardHeader>
                  <CardContent className="flex min-w-0 flex-1 flex-col gap-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={billingBadgeVariant(plan.billingType)}>
                        {formatBillingType(plan.billingType)}
                      </Badge>
                    </div>

                    <p className="text-sm leading-6 text-muted-foreground">
                      {getBestForLine(plan.slug)}
                    </p>

                    <div className="min-w-0 rounded-md border border-border bg-muted/30 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Includes
                      </p>
                      <ul className="mt-2 grid min-w-0 gap-1.5 text-sm text-foreground">
                        {getIncludedSummaryLines(planEntitlements, plan.slug).map((line) => (
                          <li key={`${plan.id}-${line}`} className="break-words">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <details className="min-w-0 rounded-md border border-border bg-background p-3">
                      <summary className="cursor-pointer text-sm font-medium text-foreground">
                        View full limits
                      </summary>
                      <div className="mt-3 grid min-w-0 gap-3 text-sm text-muted-foreground">
                        <div className="grid gap-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                            Scan limits
                          </p>
                          <p>Basic Scan: {includedLabel(planEntitlements.allowBasicScan)}</p>
                          <p>
                            Professional Scan:{" "}
                            {includedLabel(planEntitlements.allowProfessionalScan)}
                          </p>
                          <p>Basic scans/day: {planEntitlements.basicScanLimitPerDay}</p>
                          <p>
                            Professional scans/day:{" "}
                            {planEntitlements.professionalScanLimitPerDay}
                          </p>
                        </div>

                        <div className="grid gap-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                            PDF limits
                          </p>
                          <p>
                            Basic PDF reports:{" "}
                            {includedLabel(planEntitlements.allowBasicPdf)}
                          </p>
                          <p>
                            Professional PDF reports:{" "}
                            {includedLabel(planEntitlements.allowProfessionalPdf)}
                          </p>
                          <p>Basic PDF credits: {planEntitlements.basicPdfCredits}</p>
                          <p>
                            Professional PDF credits:{" "}
                            {planEntitlements.professionalPdfCredits}
                          </p>
                          <p>Total report credits: {planEntitlements.totalReportCredits}</p>
                        </div>

                        <div className="grid gap-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                            Features
                          </p>
                          <p>
                            White-label branding:{" "}
                            {includedLabel(planEntitlements.allowWhiteLabel)}
                          </p>
                          <p>
                            Agency branding:{" "}
                            {includedLabel(planEntitlements.allowAgencyBranding)}
                          </p>
                          <p>
                            Client management:{" "}
                            {includedLabel(planEntitlements.allowClientManagement)}
                          </p>
                          <p>
                            Secure share links:{" "}
                            {includedLabel(planEntitlements.allowShareLinks)}
                          </p>
                          <p>
                            Hide powered-by:{" "}
                            {includedLabel(planEntitlements.allowHidePoweredBy)}
                          </p>
                          <p>
                            Priority support:{" "}
                            {includedLabel(planEntitlements.allowPrioritySupport)}
                          </p>
                        </div>

                        <div className="grid gap-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                            Manual review
                          </p>
                          <p>
                            Light manual review credits:{" "}
                            {planEntitlements.lightManualReviewCredits}
                          </p>
                          <p>
                            Deep manual review credits:{" "}
                            {planEntitlements.deepManualReviewCredits}
                          </p>
                          <p>
                            Priority guidance:{" "}
                            {includedLabel(planEntitlements.allowPriorityGuidance)}
                          </p>
                        </div>
                      </div>
                    </details>

                    <div className="mt-auto grid gap-2">
                      {isCurrent ? (
                        <Button type="button" className="w-full" disabled>
                          Current plan
                        </Button>
                      ) : plan.billingType === "FREE" ? (
                        <Button type="button" className="w-full" variant="outline" disabled>
                          No checkout required
                        </Button>
                      ) : (
                        <>
                          {hasConfiguredPaymentMethod ? (
                            <Button asChild className="w-full">
                              <Link href="#manual-payment">Request manual payment</Link>
                            </Button>
                          ) : (
                            <Button type="button" className="w-full" variant="outline" disabled>
                              Manual payment unavailable
                            </Button>
                          )}

                          {lemonReady ? (
                            <LemonCheckoutButton
                              planId={plan.id}
                              label={
                                lemonMode === "subscription"
                                  ? "Subscribe with Card"
                                  : "Pay with Card"
                              }
                            />
                          ) : null}

                          {stripeReady ? (
                            <StripeCheckoutButton
                              planId={plan.id}
                              label={
                                stripeMode === "subscription"
                                  ? "Subscribe with Card (Stripe)"
                                  : "Pay with Card (Stripe)"
                              }
                            />
                          ) : null}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
