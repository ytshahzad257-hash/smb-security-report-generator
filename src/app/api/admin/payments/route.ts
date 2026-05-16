import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { maskStripeId } from "@/lib/stripe";
import { maskLemonId } from "@/lib/lemon";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const [requests, payments] = await Promise.all([
    prisma.manualPaymentRequest.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.payment.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        plan: { select: { name: true } },
        creditPackage: { select: { name: true } },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  return NextResponse.json({
    payments: payments.map((payment) => ({
      id: payment.id,
      user: payment.user,
      provider: payment.provider,
      packageName:
        payment.packageName ?? payment.creditPackage?.name ?? payment.plan?.name ?? null,
      amount: payment.amount.toString(),
      currency: payment.currency,
      reportCredits: payment.reportCredits,
      method: payment.method,
      status: payment.status,
      stripeCheckoutSessionId: maskStripeId(payment.stripeCheckoutSessionId),
      stripePaymentIntentId: maskStripeId(payment.stripePaymentIntentId),
      stripeInvoiceId: maskStripeId(payment.stripeInvoiceId),
      stripeSubscriptionId: maskStripeId(payment.stripeSubscriptionId),
      lemonOrderId: maskLemonId(payment.lemonOrderId),
      lemonCheckoutId: maskLemonId(payment.lemonCheckoutId),
      lemonSubscriptionId: maskLemonId(payment.lemonSubscriptionId),
      lemonCustomerId: maskLemonId(payment.lemonCustomerId),
      lemonVariantId: maskLemonId(payment.lemonVariantId),
      lemonProductId: maskLemonId(payment.lemonProductId),
      providerEventId: maskLemonId(payment.providerEventId),
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    })),
    requests: requests.map((request) => ({
      id: request.id,
      user: request.user,
      packageName: request.packageName,
      amount: request.amount.toString(),
      currency: request.currency,
      reportCredits: request.reportCredits,
      requestedPlanName: request.requestedPlanName,
      paymentMethod: request.paymentMethod,
      transactionReference: request.transactionReference,
      proofAvailable: Boolean(request.proofUrl),
      proofUrl: request.proofUrl,
      status: request.status,
      adminNote: request.adminNote,
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
    })),
    success: true,
  });
}
