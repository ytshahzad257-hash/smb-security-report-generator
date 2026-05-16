import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/admin";
import { getPrisma } from "@/lib/prisma";
import { maskStripeId } from "@/lib/stripe";
import { maskLemonId } from "@/lib/lemon";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      stripeCustomerId: true,
      lemonCustomerId: true,
      createdAt: true,
      subscriptions: {
        take: 1,
        orderBy: { updatedAt: "desc" },
        select: {
          status: true,
          provider: true,
          stripeSubscriptionId: true,
          lemonSubscriptionId: true,
          lemonCustomerId: true,
          creditsTotal: true,
          creditsRemaining: true,
          plan: { select: { name: true, slug: true } },
        },
      },
      _count: { select: { scans: true, reports: true, clients: true, reportShares: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    users: users.map((user) => ({
      ...user,
      stripeCustomerId: maskStripeId(user.stripeCustomerId),
      lemonCustomerId: maskLemonId(user.lemonCustomerId),
      subscriptions: user.subscriptions.map((subscription) => ({
        ...subscription,
        stripeSubscriptionId: maskStripeId(subscription.stripeSubscriptionId),
        lemonSubscriptionId: maskLemonId(subscription.lemonSubscriptionId),
        lemonCustomerId: maskLemonId(subscription.lemonCustomerId),
      })),
    })),
    success: true,
  });
}
