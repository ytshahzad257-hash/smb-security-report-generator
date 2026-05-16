import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { maskStripeId } from "@/lib/stripe";
import { maskLemonId } from "@/lib/lemon";

export async function GET(request: Request, context: RouteContext<"/api/admin/users/[id]">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      stripeCustomerId: true,
      lemonCustomerId: true,
      createdAt: true,
      subscriptions: { include: { plan: true }, orderBy: { updatedAt: "desc" } },
      scans: { take: 5, orderBy: { createdAt: "desc" } },
      reports: { take: 5, orderBy: { createdAt: "desc" } },
      manualPaymentRequests: { take: 5, orderBy: { createdAt: "desc" } },
      clients: { take: 5, orderBy: { createdAt: "desc" } },
      reportShares: {
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, isActive: true, expiresAt: true, viewCount: true, createdAt: true },
      },
      agencyProfile: {
        select: { agencyName: true, contactEmail: true, websiteUrl: true, showPoweredBy: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found.", success: false }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      ...user,
      stripeCustomerId: maskStripeId(user.stripeCustomerId),
      lemonCustomerId: maskLemonId(user.lemonCustomerId),
      subscriptions: user.subscriptions.map((subscription) => ({
        ...subscription,
        stripeSubscriptionId: maskStripeId(subscription.stripeSubscriptionId),
        stripeCustomerId: maskStripeId(subscription.stripeCustomerId),
        lemonSubscriptionId: maskLemonId(subscription.lemonSubscriptionId),
        lemonCustomerId: maskLemonId(subscription.lemonCustomerId),
      })),
    },
    success: true,
  });
}
