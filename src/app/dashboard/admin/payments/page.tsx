import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptText, Search } from "lucide-react";

import { PaymentReviewActions } from "@/components/admin/payment-review-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/auth";
import { statusBadgeVariant } from "@/lib/manual-payments";
import { getPrisma } from "@/lib/prisma";
import { maskStripeId } from "@/lib/stripe";
import { maskLemonId } from "@/lib/lemon";

export const metadata: Metadata = {
  title: "Payments",
  description: "Review manual payment requests and Stripe payment records.",
};

function formatDate(date: Date | null) {
  if (!date) {
    return "Not reviewed";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPrice(price: unknown, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(price));
}

function normalize(value: string | null | undefined) {
  return value?.toLowerCase().trim() ?? "";
}

function paymentBadgeVariant(status: string) {
  if (status === "APPROVED") {
    return "success" as const;
  }

  if (status === "FAILED" || status === "REJECTED") {
    return "destructive" as const;
  }

  if (status === "PENDING") {
    return "warning" as const;
  }

  return "outline" as const;
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; provider?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status = params.status?.toUpperCase();
  const query = normalize(params.q);
  const provider =
    params.provider === "MANUAL" ||
    params.provider === "STRIPE" ||
    params.provider === "LEMON"
      ? params.provider
      : undefined;
  const prisma = getPrisma();
  const [requests, payments] = await Promise.all([
    provider === "STRIPE" || provider === "LEMON"
      ? Promise.resolve([])
      : prisma.manualPaymentRequest.findMany({
          where:
            status &&
            ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(status)
              ? { status: status as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" }
              : undefined,
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
            reviewedByAdmin: {
              select: {
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
    prisma.payment.findMany({
      where: {
        ...(provider ? { provider } : {}),
        ...(status && ["PENDING", "APPROVED", "REJECTED", "FAILED", "REFUNDED"].includes(status)
          ? { status: status as "PENDING" | "APPROVED" | "REJECTED" | "FAILED" | "REFUNDED" }
          : {}),
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        plan: {
          select: {
            name: true,
          },
        },
        creditPackage: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);
  const filteredRequests = query
    ? requests.filter((request) =>
        [
          request.user.name,
          request.user.email,
          request.transactionReference,
          request.packageName,
          request.requestedPlanName,
        ].some((value) => normalize(value).includes(query)),
      )
    : requests;
  const filteredPayments = query
    ? payments.filter((payment) =>
        [
          payment.user.name,
          payment.user.email,
          payment.transactionRef,
          payment.lemonOrderId,
          payment.lemonCheckoutId,
          payment.lemonSubscriptionId,
          payment.lemonCustomerId,
          payment.providerEventId,
          payment.packageName,
          payment.plan?.name,
          payment.creditPackage?.name,
        ].some((value) => normalize(value).includes(query)),
      )
    : payments;
  const statuses = ["ALL", "PENDING", "APPROVED", "REJECTED", "FAILED", "REFUNDED", "CANCELLED"];
  const providers = ["ALL", "MANUAL", "STRIPE", "LEMON"];

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Payments"
        description="Review proof uploads, Lemon Squeezy records, Stripe records, and provider status."
        actions={
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search by user, reference, plan, or package.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {providers.map((item) => {
              const href =
                item === "ALL"
                  ? "/dashboard/admin/payments"
                  : `/dashboard/admin/payments?provider=${item}`;
              const active = item === "ALL" ? !provider : provider === item;

              return (
                <Button
                  key={item}
                  asChild
                  size="sm"
                  variant={active ? "default" : "outline"}
                >
                  <Link href={href}>{item}</Link>
                </Button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {statuses.map((item) => {
              const queryParts = [
                item === "ALL" ? null : `status=${item}`,
                provider ? `provider=${provider}` : null,
              ].filter(Boolean);
              const href = `/dashboard/admin/payments${queryParts.length > 0 ? `?${queryParts.join("&")}` : ""}`;
              const active = item === "ALL" ? !status : status === item;

              return (
                <Button
                  key={item}
                  asChild
                  size="sm"
                  variant={active ? "default" : "outline"}
                >
                  <Link href={href}>{item}</Link>
                </Button>
              );
            })}
          </div>
          <form className="grid gap-2 sm:grid-cols-[1fr_auto]">
            {status ? <input type="hidden" name="status" value={status} /> : null}
            {provider ? <input type="hidden" name="provider" value={provider} /> : null}
            <Input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search payments"
              aria-label="Search payments"
            />
            <Button type="submit" variant="outline">
              <Search aria-hidden="true" />
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment records</CardTitle>
          <CardDescription>
            {filteredPayments.length} payment record
            {filteredPayments.length === 1 ? "" : "s"} found.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPayments.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              No matching payment records.
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredPayments.map((payment) => {
                const packageName =
                  payment.packageName ??
                  payment.creditPackage?.name ??
                  payment.plan?.name ??
                  "Payment";

                return (
                  <div
                    key={payment.id}
                    className="grid gap-4 rounded-md border border-border bg-background p-4 xl:grid-cols-[1.1fr_1fr_0.8fr]"
                  >
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words text-sm font-semibold text-foreground">
                          {packageName}
                        </p>
                        <Badge
                          variant={
                            payment.provider === "LEMON"
                              ? "success"
                              : payment.provider === "STRIPE"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {payment.provider}
                        </Badge>
                        <Badge variant={paymentBadgeVariant(payment.status)}>
                          {payment.status}
                        </Badge>
                      </div>
                      <dl className="grid gap-2 text-sm">
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">User</dt>
                          <dd className="break-words font-semibold text-foreground">
                            {payment.user.name ?? "Unnamed"} ({payment.user.email})
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">Amount</dt>
                          <dd className="font-semibold text-foreground">
                            {formatPrice(payment.amount, payment.currency)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">Credits added</dt>
                          <dd className="font-semibold text-foreground">
                            {payment.reportCredits}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <dl className="grid gap-2 text-sm">
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Method</dt>
                        <dd className="break-words font-semibold text-foreground">
                          {payment.method}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Created</dt>
                        <dd className="font-semibold text-foreground">
                          {formatDate(payment.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Updated</dt>
                        <dd className="font-semibold text-foreground">
                          {formatDate(payment.updatedAt)}
                        </dd>
                      </div>
                      {payment.provider === "MANUAL" ? (
                        <div>
                          <dt className="text-xs font-medium text-muted-foreground">Reference</dt>
                          <dd className="break-words font-semibold text-foreground">
                            {payment.transactionRef ?? "Not provided"}
                          </dd>
                        </div>
                      ) : null}
                    </dl>

                    <dl className="grid content-start gap-2 text-sm">
                      {payment.provider === "LEMON" ? (
                        <>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">Lemon order</dt>
                            <dd className="break-words font-semibold text-foreground">
                              {maskLemonId(payment.lemonOrderId)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">Lemon checkout</dt>
                            <dd className="break-words font-semibold text-foreground">
                              {maskLemonId(payment.lemonCheckoutId)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">Lemon subscription</dt>
                            <dd className="break-words font-semibold text-foreground">
                              {maskLemonId(payment.lemonSubscriptionId)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">Lemon customer</dt>
                            <dd className="break-words font-semibold text-foreground">
                              {maskLemonId(payment.lemonCustomerId)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">Provider event</dt>
                            <dd className="break-words font-semibold text-foreground">
                              {maskLemonId(payment.providerEventId)}
                            </dd>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">Checkout</dt>
                            <dd className="break-words font-semibold text-foreground">
                              {maskStripeId(payment.stripeCheckoutSessionId)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">Invoice</dt>
                            <dd className="break-words font-semibold text-foreground">
                              {maskStripeId(payment.stripeInvoiceId)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">Payment intent</dt>
                            <dd className="break-words font-semibold text-foreground">
                              {maskStripeId(payment.stripePaymentIntentId)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-muted-foreground">Subscription</dt>
                            <dd className="break-words font-semibold text-foreground">
                              {maskStripeId(payment.stripeSubscriptionId)}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual payment requests</CardTitle>
          <CardDescription>
            {filteredRequests.length} request{filteredRequests.length === 1 ? "" : "s"} found.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredRequests.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              No matching payment requests.
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredRequests.map((request) => (
                <div
                  key={request.id}
                  className="grid gap-4 rounded-md border border-border bg-background p-4 xl:grid-cols-[1.1fr_1fr_0.8fr]"
                >
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words text-sm font-semibold text-foreground">
                        {request.packageName}
                      </p>
                      <Badge variant={statusBadgeVariant(request.status)}>
                        {request.status}
                      </Badge>
                    </div>
                    <dl className="grid gap-2 text-sm">
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">User</dt>
                        <dd className="break-words font-semibold text-foreground">
                          {request.user.name ?? "Unnamed"} ({request.user.email})
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Amount</dt>
                        <dd className="font-semibold text-foreground">
                          {formatPrice(request.amount, request.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Credits</dt>
                        <dd className="font-semibold text-foreground">
                          {request.reportCredits}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <dl className="grid gap-2 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Method</dt>
                      <dd className="break-words font-semibold text-foreground">
                        {request.paymentMethod}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Reference</dt>
                      <dd className="break-words font-semibold text-foreground">
                        {request.transactionReference ?? "Not provided"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Created</dt>
                      <dd className="font-semibold text-foreground">
                        {formatDate(request.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">Reviewed</dt>
                      <dd className="break-words font-semibold text-foreground">
                        {formatDate(request.reviewedAt)}
                        {request.reviewedByAdmin
                          ? ` by ${request.reviewedByAdmin.email}`
                          : ""}
                      </dd>
                    </div>
                    {request.adminNote ? (
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Admin note</dt>
                        <dd className="break-words rounded-md border border-destructive/35 bg-destructive/10 p-2 text-destructive">
                          {request.adminNote}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="grid content-start gap-3">
                    {request.proofUrl ? (
                      <Button asChild variant="outline">
                        <Link href={request.proofUrl} target="_blank">
                          <ReceiptText aria-hidden="true" />
                          View proof
                        </Link>
                      </Button>
                    ) : null}
                    {request.status === "PENDING" ? (
                      <PaymentReviewActions requestId={request.id} />
                    ) : (
                      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                        Review action is closed for this request.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
