import { NextResponse } from "next/server";

import { assertActiveUser, getCurrentUser } from "@/lib/auth";
import {
  createStripePortalForUser,
  safeStripeErrorMessage,
} from "@/lib/stripe-billing";
import { StripeConfigError } from "@/lib/stripe";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required.", success: false },
      { status: 401 },
    );
  }

  await assertActiveUser(user.id);

  try {
    const portal = await createStripePortalForUser({
      userId: user.id,
      requestUrl: request.url,
    });

    return NextResponse.json({ ...portal, success: true });
  } catch (error) {
    const status = error instanceof StripeConfigError ? 503 : 400;

    return NextResponse.json(
      {
        error: safeStripeErrorMessage(error) || "Stripe billing portal is unavailable.",
        success: false,
      },
      { status },
    );
  }
}
